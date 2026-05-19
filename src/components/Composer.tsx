import { useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { useAppStore } from "../store/appStore";
import { ModelBar } from "./ModelBar";

export function Composer() {
  const [text, setText] = useState("");
  const send = useAppStore((s) => s.send);
  const racing = useAppStore((s) => s.racing);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const value = text.trim();
    if (!value || racing) return;
    setText("");
    if (taRef.current) taRef.current.style.height = "auto";
    void send(value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter is a newline. Ignore Enter mid-IME-composition.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const onChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  return (
    <div className="composer">
      <div className="composer-inner">
        <ModelBar />
        <div className="composer-box">
          <textarea
            ref={taRef}
            className="composer-input"
            placeholder="Ask anything — Enter to send, Shift+Enter for newline"
            value={text}
            onChange={onChange}
            onKeyDown={onKeyDown}
            rows={1}
          />
          <button
            className="send-btn"
            onClick={submit}
            disabled={racing || text.trim().length === 0}
            title={racing ? "Streaming…" : "Send"}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
