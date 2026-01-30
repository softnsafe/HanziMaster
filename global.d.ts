declare namespace NodeJS {
  interface ProcessEnv {
    API_KEY: string;
    REACT_APP_BACKEND_URL?: string;
  }
}

interface Window {
  HanziWriter: any;
  webkitAudioContext: typeof AudioContext;
}
