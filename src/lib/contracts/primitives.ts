import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const instantSchema = z.string().datetime({ offset: true });
export const timezoneSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((timezone) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
      return true;
    } catch {
      return false;
    }
  }, "Use an IANA timezone");
