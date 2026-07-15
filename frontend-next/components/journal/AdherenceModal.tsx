"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import {
  adherenceScore,
  loadAdherenceQuestions,
  type AdherenceAnswer,
} from "@/lib/journal/discipline";

/**
 * Kurze Selbstbewertung direkt nach dem Loggen: "Plan befolgt?" —
 * unabhängig von Gewinn/Verlust. Überspringen erlaubt (Score bleibt leer).
 */

interface AdherenceModalProps {
  tradeLabel: string; // z.B. "EURUSD · 2026-07-16"
  onSave: (answers: AdherenceAnswer[], scorePct: number) => Promise<void>;
  onSkip: () => void;
}

export default function AdherenceModal({ tradeLabel, onSave, onSkip }: AdherenceModalProps) {
  const [answers, setAnswers] = useState<{ label: string; yes: boolean | null }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAdherenceQuestions()
      .then((qs) => setAnswers(qs.map((label) => ({ label, yes: null }))))
      .catch(() => {});
  }, []);

  const complete = answers.length > 0 && answers.every((a) => a.yes !== null);
  const preview = complete
    ? adherenceScore(answers.map((a) => ({ label: a.label, yes: a.yes === true })))
    : null;

  const setAnswer = (label: string, yes: boolean) =>
    setAnswers((prev) => prev.map((a) => (a.label === label ? { ...a, yes } : a)));

  const handleSave = async () => {
    if (!complete) return;
    setSaving(true);
    try {
      const final = answers.map((a) => ({ label: a.label, yes: a.yes === true }));
      await onSave(final, adherenceScore(final));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onSkip} title="Plan befolgt?" subtitle={tradeLabel} size="sm">
      <div className="space-y-4">
        <p className="text-[12px] text-muted">
          Ehrliche Selbstbewertung — unabhängig davon, ob der Trade Gewinn oder Verlust war.
        </p>
        <div className="space-y-1.5">
          {answers.map((a) => (
            <div key={a.label} className="flex items-center justify-between gap-3">
              <span className="text-[12px] text-text">{a.label}</span>
              <div className="flex gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setAnswer(a.label, true)}
                  className={`px-3 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                    a.yes === true
                      ? "bg-up/15 text-up border-up/50"
                      : "bg-surface text-muted border-border2 hover:text-text"
                  }`}
                >
                  Ja
                </button>
                <button
                  type="button"
                  onClick={() => setAnswer(a.label, false)}
                  className={`px-3 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                    a.yes === false
                      ? "bg-down/15 text-down border-down/50"
                      : "bg-surface text-muted border-border2 hover:text-text"
                  }`}
                >
                  Nein
                </button>
              </div>
            </div>
          ))}
        </div>
        {preview !== null && (
          <div
            className={`rounded-md border px-3 py-2 text-[12px] font-bold font-mono ${
              preview >= 75
                ? "bg-up/10 text-up border-up/40"
                : preview >= 50
                  ? "bg-warn/10 text-warn border-warn/40"
                  : "bg-down/10 text-down border-down/40"
            }`}
          >
            Adherence: {preview.toFixed(0)} %
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="ghost" onClick={onSkip}>
            Überspringen
          </Button>
          <Button type="button" icon="ph-check" disabled={!complete || saving} onClick={handleSave}>
            {saving ? "Speichern…" : "Bewertung speichern"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
