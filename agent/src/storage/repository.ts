import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import type { DataStore } from "../types.js";

const INITIAL_DATA: DataStore = {
  sessions: [],
  platformAuths: [],
  documentRefs: [],
  normalizedDocuments: [],
  chunks: [],
  analysisTasks: [],
  facts: [],
  experiences: [],
  highlights: [],
  resumeAnalysisTasks: []
};

function normalizeLoaded(raw: unknown): DataStore {
  const p = raw as Partial<DataStore>;
  return {
    sessions: p.sessions ?? [],
    platformAuths: p.platformAuths ?? [],
    documentRefs: p.documentRefs ?? [],
    normalizedDocuments: p.normalizedDocuments ?? [],
    chunks: p.chunks ?? [],
    analysisTasks: p.analysisTasks ?? [],
    facts: p.facts ?? [],
    experiences: p.experiences ?? [],
    highlights: p.highlights ?? [],
    resumeAnalysisTasks: p.resumeAnalysisTasks ?? []
  };
}

export class Repository {
  private data: DataStore;
  private readonly dataFile: string;

  constructor() {
    this.dataFile = path.resolve(config.dataFile);
    this.data = this.load();
  }

  private load(): DataStore {
    const dir = path.dirname(this.dataFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(this.dataFile)) {
      fs.writeFileSync(this.dataFile, JSON.stringify(INITIAL_DATA, null, 2), "utf8");
      return structuredClone(INITIAL_DATA);
    }
    const raw = fs.readFileSync(this.dataFile, "utf8");
    return normalizeLoaded(JSON.parse(raw));
  }

  private persist(): void {
    const tmp = `${this.dataFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), "utf8");
    fs.renameSync(tmp, this.dataFile);
  }

  snapshot(): DataStore {
    return structuredClone(this.data);
  }

  mutate(mutator: (data: DataStore) => void): void {
    mutator(this.data);
    this.persist();
  }
}
