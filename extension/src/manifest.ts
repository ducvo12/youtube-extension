import type { ManifestV3Export } from "@crxjs/vite-plugin";

const manifest: ManifestV3Export = {
  manifest_version: 3,
  name: "Hello World Extension",
  version: "1.0.0",
  description: "A basic Chrome extension that displays hello world.",
  action: {
    default_popup: "src/popup/popup.html",
    default_title: "Hello World",
  },
  background: {
    service_worker: "src/background.ts",
    type: "module",
  },
  permissions: ["storage"],
  host_permissions: ["http://localhost:8000/*"],
  content_scripts: [
    {
      matches: ["https://www.youtube.com/*"],
      js: ["src/content/youtube.ts"],
      css: ["src/content/youtube.css"],
    },
  ],
};

export default manifest;
