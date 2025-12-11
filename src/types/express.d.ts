import { APIVersion } from '.';

declare global {
  namespace Express {
    interface Request {
      id?: string;
      apiVersion?: APIVersion;
    }
  }
}
