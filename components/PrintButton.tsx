"use client";

export function PrintButton() {
  return <button type="button" className="small no-print" onClick={() => window.print()}>Print / save as PDF</button>;
}
