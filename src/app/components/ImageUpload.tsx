'use client';

import { supabase } from "@/utils/supabase/client";
import { FilePond, registerPlugin } from 'react-filepond';
import 'filepond/dist/filepond.min.css';
import FilePondPluginImagePreview from 'filepond-plugin-image-preview';
import 'filepond-plugin-image-preview/dist/filepond-plugin-image-preview.css';
import { useState } from "react";

registerPlugin(FilePondPluginImagePreview);

interface ImageUploadProps {
  onUpload: (url: string) => void;
}

export default function ImageUpload({ onUpload }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (fileItems: any[]) => {
    if (fileItems.length === 0) return;

    const file = fileItems[0].file;
    const filePath = `profile-pictures/${Date.now()}-${file.name}`;

    setUploading(true);

    const { data, error } = await supabase.storage
      .from('sunshine-pics')
      .upload(filePath, file);

    if (error) {
      console.error("Upload error:", error.message);
      setUploading(false);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from('sunshine-pics')
      .getPublicUrl(filePath);

    if (publicUrlData?.publicUrl) {
      onUpload(publicUrlData.publicUrl);
    }

    setUploading(false);
  };

  return (
    <FilePond
      allowMultiple={false}
      acceptedFileTypes={['image/*']}
      labelIdle='Drag & Drop your image or <span class="filepond--label-action">Browse</span>'
      onupdatefiles={handleUpload}
    />
  );
}
