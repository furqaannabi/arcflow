import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";

interface CSVUploadProps {
  onUpload: (fileContent: string) => Promise<void>;
  disabled?: boolean;
}

export default function CSVUpload({ onUpload, disabled }: CSVUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be selected again
    e.target.value = "";

    try {
      setIsUploading(true);
      const text = await file.text();
      await onUpload(text);
    } catch (error) {
      console.error("Failed to upload file:", error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".csv"
        className="hidden"
      />
      <Button
        variant="outline"
        disabled={disabled || isUploading}
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-2 h-full rounded-xl px-6 border-gray-200 text-gray-700 bg-white hover:bg-gray-50 shadow-sm"
      >
        {isUploading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Upload className="w-5 h-5" />
        )}
        <span className="font-medium">Upload CSV</span>
      </Button>
    </>
  );
}
