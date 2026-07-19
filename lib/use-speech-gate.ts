'use client';

import { useRef } from 'react';

// Turn-taking gate for feeding text replies into a live ElevenLabs voice session.
// The SDK's mode signal is a voice-activity detector that flickers during pauses
// inside a sentence, so a queued reply is delivered only after the agent's audio
// has started AND then gone silent for silenceMs continuously.
export function useSpeechGate(silenceMs = 1500) {
  const speakingRef = useRef(false);
  const awaitingSpeechRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);

  function flush() {
    if (!pendingRef.current || speakingRef.current || awaitingSpeechRef.current) return;
    const deliver = pendingRef.current;
    pendingRef.current = null;
    deliver();
  }

  return {
    onModeChange({ mode }: { mode: string }) {
      if (mode === 'speaking') {
        speakingRef.current = true;
        awaitingSpeechRef.current = false;
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current); // a flicker, not the end of the turn
          silenceTimerRef.current = null;
        }
      } else if (speakingRef.current && !silenceTimerRef.current) {
        silenceTimerRef.current = setTimeout(() => {
          silenceTimerRef.current = null;
          speakingRef.current = false; // sustained silence — the turn is really over
          flush();
        }, silenceMs);
      }
    },
    // Call when an agent message arrives: closes the gate until its audio has played.
    noteAgentMessage() {
      if (speakingRef.current) return;
      awaitingSpeechRef.current = true;
      setTimeout(() => {
        // Failsafe: if no audio ever starts, don't deadlock the call.
        if (awaitingSpeechRef.current) {
          awaitingSpeechRef.current = false;
          flush();
        }
      }, 8000);
    },
    queue(deliver: () => void) {
      pendingRef.current = deliver;
      flush();
    },
    clear() {
      pendingRef.current = null;
    },
  };
}
