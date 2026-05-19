import { useRef, useState } from "react";
import type { KeyboardEvent, ChangeEvent } from "react";
import { Send } from "lucide-react";
import { useAppStore } from "../store/appStore";

export function Composer() {
  const [text, setText] = useState("");
  const sendMessage = useAppStore((s) => s.sendMessage);
  const busy = useAppStore((s) => {
    const st = s.streaming;
    return st != null && st.status !== "done" && st.status !== "error";
  });
  const taRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const value = text.trim();
    if (!value || busy) return;
    setText("");
    if (taRef.current) taRef.current.style.height = "auto";
    void sendMessage(value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter is a newline. Ignore Enter while an IME
    // composition is in progress (important for CJK input).
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const onChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 220) + "px";
  };

  return (
    <div className="composer">
      <div className="composer-box">
        <textarea
          ref={taRef}
          className="composer-input"
          placeholder="Message Maple…   (Enter to send · Shift+Enter for newline)"
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          rows={1}
        />
        <button
          className="send-btn"
          onClick={submit}
          disabled={busy || text.trim().length === 0}
          title={busy ? "Streaming…" : "Send"}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
