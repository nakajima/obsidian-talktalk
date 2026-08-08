declare module "*.wasm" {
  const base64: string;
  export default base64;
}

declare module "talktalk:runner-worker" {
  const source: string;
  export default source;
}
