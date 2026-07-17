// src/types/google.d.ts

// Khai báo mở rộng cho Global Window Object để TypeScript nhận diện Google Identity Services (GIS) SDK
interface Window {
  google?: {
    accounts?: {
      oauth2?: {
        initTokenClient: (config: {
          client_id: string;
          scope: string;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          callback: (response: any) => void;
        }) => {
          requestAccessToken: (options?: { prompt?: string }) => void;
        };
      };
    };
  };
}
