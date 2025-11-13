
import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Point, Rect } from './types';
import { UploadIcon, SearchIcon, MoveIcon, MousePointerIcon } from './components/Icons';
import { extractTextFromImage } from './services/geminiService';

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 10;
const ZOOM_SENSITIVITY = 0.001;

const App: React.FC = () => {
    const [image, setImage] = useState<File | null>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
    const [selection, setSelection] = useState<Rect | null>(null);
    const [isPanning, setIsPanning] = useState(false);
    const [isSelecting, setIsSelecting] = useState(false);
    const [startPanPoint, setStartPanPoint] = useState<Point>({ x: 0, y: 0 });
    const [startSelectionPoint, setStartSelectionPoint] = useState<Point>({ x: 0, y: 0 });
    
    const [isLoading, setIsLoading] = useState(false);
    const [extractedText, setExtractedText] = useState('');
    const [error, setError] = useState<string | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImage(file);
            setImageUrl(URL.createObjectURL(file));
            resetView();
        }
    };

    const resetView = () => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setSelection(null);
        setExtractedText('');
        setError(null);
    };

    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

    const screenToImageCoords = useCallback((screenPoint: Point): Point => {
        if (!containerRef.current) return screenPoint;
        const containerRect = containerRef.current.getBoundingClientRect();
        const x = (screenPoint.x - containerRect.left - pan.x) / zoom;
        const y = (screenPoint.y - containerRect.top - pan.y) / zoom;
        return { x, y };
    }, [pan, zoom]);

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const newZoom = clamp(zoom - e.deltaY * ZOOM_SENSITIVITY, MIN_ZOOM, MAX_ZOOM);
        const mousePos = { x: e.clientX, y: e.clientY };
        
        const beforeZoom = screenToImageCoords(mousePos);
        
        if (!containerRef.current) return;
        const containerRect = containerRef.current.getBoundingClientRect();
        
        const newPanX = mousePos.x - containerRect.left - beforeZoom.x * newZoom;
        const newPanY = mousePos.y - containerRect.top - beforeZoom.y * newZoom;

        setZoom(newZoom);
        setPan({ x: newPanX, y: newPanY });
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return; // Only left click
        if (e.shiftKey) {
            setIsPanning(true);
            setStartPanPoint({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        } else {
            setIsSelecting(true);
            const startPoint = screenToImageCoords({ x: e.clientX, y: e.clientY });
            setStartSelectionPoint(startPoint);
            setSelection({ x: startPoint.x, y: startPoint.y, width: 0, height: 0 });
        }
    };
    
    const handleMouseMove = (e: React.MouseEvent) => {
        if (isPanning) {
            const newPanX = e.clientX - startPanPoint.x;
            const newPanY = e.clientY - startPanPoint.y;
            setPan({ x: newPanX, y: newPanY });
        } else if (isSelecting) {
            const currentPoint = screenToImageCoords({ x: e.clientX, y: e.clientY });
            const newSelection: Rect = {
                x: Math.min(startSelectionPoint.x, currentPoint.x),
                y: Math.min(startSelectionPoint.y, currentPoint.y),
                width: Math.abs(currentPoint.x - startSelectionPoint.x),
                height: Math.abs(currentPoint.y - startSelectionPoint.y),
            };
            setSelection(newSelection);
        }
    };

    const handleMouseUp = () => {
        setIsPanning(false);
        setIsSelecting(false);
    };

    const handleExtract = async () => {
        if (!image || !selection || !imageRef.current || selection.width < 1 || selection.height < 1) {
            setError("Please select a valid region on the image first.");
            return;
        }

        setIsLoading(true);
        setExtractedText('');
        setError(null);

        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error("Could not get canvas context");
            
            const img = imageRef.current;
            const scaleX = img.naturalWidth / img.width;
            const scaleY = img.naturalHeight / img.height;

            const cropX = selection.x * scaleX;
            const cropY = selection.y * scaleY;
            const cropWidth = selection.width * scaleX;
            const cropHeight = selection.height * scaleY;

            canvas.width = cropWidth;
            canvas.height = cropHeight;

            ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
            
            const base64Image = canvas.toDataURL('image/jpeg').split(',')[1];
            const text = await extractTextFromImage(base64Image);
            setExtractedText(text);

        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : "An unknown error occurred during text extraction.");
        } finally {
            setIsLoading(false);
        }
    };
    
    useEffect(() => {
        const handleMouseLeave = () => {
            if (isPanning || isSelecting) {
                handleMouseUp();
            }
        };
        const container = containerRef.current;
        container?.addEventListener('mouseleave', handleMouseLeave);
        return () => container?.removeEventListener('mouseleave', handleMouseLeave);
    }, [isPanning, isSelecting]);


    return (
        <div className="flex h-screen w-screen flex-col bg-gray-900 text-gray-200">
            <header className="flex items-center justify-between border-b border-gray-700 bg-gray-800 px-6 py-3 shadow-lg">
                <h1 className="text-xl font-bold text-cyan-400">Vision OCR</h1>
                <label htmlFor="file-upload" className="cursor-pointer rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-gray-800">
                    {image ? 'Change Image' : 'Upload Image'}
                </label>
                <input id="file-upload" type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </header>
            <main className="flex flex-1 overflow-hidden">
                <div className="relative flex-1 bg-gray-900 overflow-hidden" ref={containerRef} onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
                    {imageUrl ? (
                        <>
                            <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
                            <img
                                ref={imageRef}
                                src={imageUrl}
                                alt="Uploaded content"
                                className="pointer-events-none absolute"
                                style={{
                                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                                    transformOrigin: '0 0',
                                    willChange: 'transform'
                                }}
                            />
                             {selection && (
                                <div
                                    className="pointer-events-none absolute border-2 border-dashed border-cyan-400 bg-cyan-400 bg-opacity-20"
                                    style={{
                                        left: `${pan.x + selection.x * zoom}px`,
                                        top: `${pan.y + selection.y * zoom}px`,
                                        width: `${selection.width * zoom}px`,
                                        height: `${selection.height * zoom}px`,
                                        willChange: 'left, top, width, height'
                                    }}
                                />
                            )}
                        </>
                    ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center text-center text-gray-500">
                            <UploadIcon className="mb-4 h-24 w-24" />
                            <h2 className="text-2xl font-semibold">Upload an image to begin</h2>
                            <p className="mt-2 max-w-md">For best results, use high-resolution images. This tool is optimized for extracting small text from large pictures.</p>
                        </div>
                    )}
                </div>
                <aside className="flex w-full max-w-md flex-col border-l border-gray-700 bg-gray-800 shadow-2xl lg:max-w-lg">
                    <div className="border-b border-gray-700 p-4">
                         <h2 className="text-lg font-semibold text-white">Controls & Results</h2>
                         <div className="mt-4 space-y-2 text-sm text-gray-400">
                            <p className="flex items-center"><MousePointerIcon className="mr-2 h-5 w-5 text-cyan-400"/> Click and drag to select a region.</p>
                            <p className="flex items-center"><MoveIcon className="mr-2 h-5 w-5 text-cyan-400"/> Hold <kbd className="mx-1 rounded-md border border-gray-500 bg-gray-600 px-1.5 py-0.5 text-xs">Shift</kbd> and drag to pan.</p>
                            <p className="flex items-center"><SearchIcon className="mr-2 h-5 w-5 text-cyan-400"/> Use mouse wheel to zoom in and out.</p>
                         </div>
                    </div>
                    <div className="flex flex-col p-4 flex-1">
                      <button onClick={handleExtract} disabled={isLoading || !selection || selection.width < 1 || selection.height < 1} className="w-full rounded-md bg-green-600 px-4 py-3 text-base font-bold text-white shadow-md transition-all hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-600 disabled:opacity-50">
                          {isLoading ? 'Extracting...' : 'Extract Text from Selection'}
                      </button>
                      <div className="mt-4 flex-1 overflow-y-auto rounded-md bg-gray-900 p-4 ring-1 ring-gray-700">
                          <h3 className="text-md font-semibold text-gray-300">Extracted Text:</h3>
                          {isLoading && (
                            <div className="flex items-center justify-center pt-10">
                              <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-cyan-400 border-t-transparent"></div>
                            </div>
                          )}
                          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
                          <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-gray-200">{extractedText}</pre>
                          {!isLoading && !extractedText && !error && (
                            <p className="mt-2 text-sm text-gray-500">
                                The text you extract will appear here.
                            </p>
                          )}
                      </div>
                    </div>
                </aside>
            </main>
        </div>
    );
};

export default App;
