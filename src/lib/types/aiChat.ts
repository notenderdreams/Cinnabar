export interface AiChatAttachment {
  id: string;
  type: 'image' | 'text';
  dataUrl?: string;
  text?: string;
  pageNumber?: number;
  width?: number;
  height?: number;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  pageNumber?: number;
  status?: 'sending' | 'complete' | 'error';
  error?: string;
  attachments?: AiChatAttachment[];
}

export interface AiChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  docKey?: string;
  docName?: string;
  messages: AiChatMessage[];
}
