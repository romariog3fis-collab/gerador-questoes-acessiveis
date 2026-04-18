import { Timestamp } from 'firebase/firestore';

export interface HistoryItem {
  id: string;
  adaptationType: string;
  createdAt: Timestamp;
  content: string; // Isso agora será uma string JSON ou Markdown dependendo do item
  originalContent?: string;
  metadata?: {
    etapaEnsino?: string;
    ano?: string;
    [key: string]: any;
  };
}

export interface Question {
  id: string;
  originalNumber: string | number;
  bloomLevel: string;
  content: string; // Markdown
  type: 'multiple_choice' | 'essay' | 'true_false' | 'fill_blanks' | 'match_columns';
  options?: {
    letter: string;
    text: string;
  }[];
  // Campos para novos tipos
  pairs?: { left: string; right: string }[]; // match_columns
  blanks?: string[]; // fill_blanks (respostas corretas na ordem)
  isTrue?: boolean; // true_false (legado)
  assertions?: { text: string; isTrue: boolean }[]; // true_false (novo)
  answer: string;
  justification: string;
  glossary?: { word: string; meaning: string }[];
  steps?: string[];
  imagePrompt?: string;
}

export interface StructuredResult {
  title: string;
  studentInfo: boolean;
  questions: Question[];
  overallAEEInfo?: string;
}
