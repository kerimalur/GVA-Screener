import ScannerGate from "@/components/scanner/ScannerGate";

export default function ScannerLayout({ children }: { children: React.ReactNode }) {
  return <ScannerGate>{children}</ScannerGate>;
}
