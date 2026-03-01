import { z } from "zod";
import { householdProcedure, router } from "../init";
import { analyzeFileStructure, isOpheliaEnabled } from "@/lib/ophelia";

export const opheliaRouter = router({
  /**
   * Sends the first ~30 lines of a bank file to the AI and returns detected
   * column mappings, date format, decimal separator, and other metadata.
   *
   * Returns null when Ophelia is disabled, the API call fails, or the
   * response cannot be parsed — the caller falls back to manual mapping.
   */
  analyzeFile: householdProcedure
    .input(
      z.object({
        /** First ~30 lines of the file as a plain-text string (already CSV or TSV). */
        rawContent: z.string().max(100_000),
        /** Original filename — helps the AI detect the bank format. */
        filename: z.string().max(255),
        /** Detected delimiter: "," for CSV, "\t" for TSV. */
        delimiter: z.string().max(4).optional(),
      })
    )
    .mutation(async ({ input }) => {
      if (!isOpheliaEnabled()) return null;
      return analyzeFileStructure({
        rawContent: input.rawContent,
        filename: input.filename,
        delimiter: input.delimiter,
      });
    }),
});
