export type BotMessage =
  | { type: "text"; text: string }
  | { type: "buttons"; body: string; buttons: { id: string; title: string }[]; footer?: string }
  | {
      type: "list";
      body: string;
      button: string;
      sections: { title?: string; rows: { id: string; title: string; description?: string }[] }[];
      footer?: string;
    };

export type ChatEntry =
  | { from: "user"; text: string; key: string }
  | { from: "bot"; message: BotMessage; key: string };
