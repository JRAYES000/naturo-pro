/**
 * Dictée vocale via la Web Speech API du navigateur (Chrome, Edge, Safari) : gratuite,
 * sans envoi à nos serveurs. `supported` est faux ailleurs (Firefox) : masquer le bouton.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export function useDictation(onText: (text: string) => void) {
  const Ctor: any = typeof window !== "undefined" ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const stop = useCallback(() => { recRef.current?.stop(); }, []);

  const start = useCallback(() => {
    if (!Ctor || recRef.current) return;
    const rec = new Ctor();
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) onTextRef.current(e.results[i][0].transcript.trim());
      }
    };
    rec.onend = () => { recRef.current = null; setListening(false); };
    rec.onerror = () => { recRef.current = null; setListening(false); };
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, [Ctor]);

  useEffect(() => () => recRef.current?.abort(), []);

  return { supported: !!Ctor, listening, start, stop };
}
