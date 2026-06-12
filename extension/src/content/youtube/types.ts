export type BackendResult = {
  response?: string;
  error?: string;
  details?: unknown;
  [key: string]: unknown;
};

export type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: {
    brands?: Array<{
      brand: string;
      version: string;
    }>;
  };
};

export type Caption = {
  start: number;
  end: number;
  text: string;
  isWord?: boolean;
};
