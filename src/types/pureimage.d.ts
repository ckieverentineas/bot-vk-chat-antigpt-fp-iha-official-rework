declare module 'pureimage' {
    export interface FontRegistration {
        loadSync(): void;
    }

    export interface TextMetrics {
        width: number;
    }

    export interface DrawingContext {
        fillStyle: string;
        font: string;
        fillRect(x: number, y: number, width: number, height: number): void;
        fillText(text: string, x: number, y: number): void;
        measureText(text: string): TextMetrics;
    }

    export interface Bitmap {
        getContext(type: '2d'): DrawingContext;
    }

    export function make(width: number, height: number): Bitmap;
    export function registerFont(path: string, family: string): FontRegistration;
    export function encodePNGToStream(bitmap: Bitmap, stream: NodeJS.WritableStream): Promise<void>;
}
