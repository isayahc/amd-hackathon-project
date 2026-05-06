/// <reference types="vite/client" />

declare module "occt-import-js" {
  type OcctModule = {
    ReadStepFile: (content: Uint8Array, params: Record<string, unknown> | null) => {
      success: boolean;
      root: unknown;
      meshes: unknown[];
    };
  };

  type OcctFactoryOptions = {
    locateFile?: (path: string) => string;
  };

  export default function occtimportjs(options?: OcctFactoryOptions): Promise<OcctModule>;
}

declare module "occt-import-js/dist/*.wasm?url" {
  const wasmUrl: string;
  export default wasmUrl;
}