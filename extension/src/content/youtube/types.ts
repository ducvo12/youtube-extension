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
