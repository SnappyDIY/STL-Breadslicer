import {defineConfig} from 'vite';

// Local development stays at /; Pages builds use the repository subdirectory.
export default defineConfig({base: process.env.PAGES_BASE_PATH || '/'});
