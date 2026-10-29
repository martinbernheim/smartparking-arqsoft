/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_MOCK?: string;
  readonly VITE_MOCK_ROLE?: 'ADMIN' | 'CLIENTE';
}
interface ImportMeta { readonly env: ImportMetaEnv }
