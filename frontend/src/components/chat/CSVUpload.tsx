import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";

interface CSVUploadProps {
  onFilesSelect: (files: File[]) => void;
  disabled?: boolean;
}

export default function CSVUpload({ onFilesSelect, disabled }: CSVUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    // Basic validation
    const validFiles = files.filter(file => file.name.endsWith('.csv'));
    
    if (validFiles.length !== files.length) {
      alert("Some files were skipped because they are not CSVs");
    }

    if (validFiles.length > 0) {
      onFilesSelect(validFiles);
    }
    
    e.target.value = ""; // Reset input
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".csv"
        className="hidden"
        multiple
      />
      <Button
        variant="outline"
        disabled={disabled}
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-2 h-full rounded-xl px-4 border-gray-200 dark:border-border text-gray-700 dark:text-foreground bg-white dark:bg-card hover:bg-gray-50 dark:hover:bg-accent shadow-sm shrink-0 transition-colors"
      >
        <Upload className="w-5 h-5" />
        <span className="font-medium hidden sm:inline">Upload CSV</span>
      </Button>
    </>
  );
}
