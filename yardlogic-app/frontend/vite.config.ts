import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

if (process.env.NODE_ENV === "production" && !process.env.VITE_API_URL) {
  throw new Error("VITE_API_URL is required for production frontend builds");
}

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
