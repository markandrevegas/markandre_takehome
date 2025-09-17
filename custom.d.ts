declare module "*.svg" {
  const src: string;
  export default src;
}

declare module "*.md" {
  const content: string;
  export default content;
}

declare module "*.md?raw" {
  const content: string;
  export default content;
}
