import type { Message } from "@/types";

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`msg ${isUser ? "user" : "ai"}`}>
      <div className="msg-lbl">
        {isUser ? "You" : (message.model ?? "Agent")}
      </div>
      <div className="msg-body">
        {message.content}
        {isStreaming && !isUser && (
          <span className="stream-cursor" aria-hidden />
        )}
      </div>
    </div>
  );
}
