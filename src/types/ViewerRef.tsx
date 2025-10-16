export interface ViewerRef {
  getCanvas: () => HTMLCanvasElement | null;
  resize: (width: number, height: number) => void;
}

export type BoundingBox = {
  min: Float32Array<ArrayBuffer>;
  max: Float32Array<ArrayBuffer>;
};
