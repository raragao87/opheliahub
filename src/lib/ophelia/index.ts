export { chatCompletion, chatConversation, extractJSON, isOpheliaEnabled } from "./provider";
export { getOpheliaClient } from "./client";
export { analyzeFileStructure } from "./analyzeFileStructure";
export { enrichTransactions } from "./enrichTransactions";
export { categorizeTransactionBatch } from "./categorize-batch";
export type { CategorizeBatchResult } from "./categorize-batch";
export type {
  AnalyzeFileStructureInput,
  FileStructureAnalysis,
  DetectedField,
  MappedFieldName,
  EnrichTransactionsInput,
  EnrichTransactionInput,
  CategoryContext,
  TagContext,
  RecentExample,
  EnrichmentResult,
} from "./types";
