import { AppFormLayout } from "@calcom/app-store/_components/AppFormLayout";
import { useApp } from "@calcom/app-store/_utils/useApp";
import { Button, showToast, TextField } from "@calcom/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ProtonSetupPage(): JSX.Element {
  const router = useRouter();
  const [url, setUrl] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const { data: app } = useApp("protoncalendar");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/app-store/protoncalendar/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) throw new Error("Failed to verify Proton URL");

      showToast("Proton Calendar connected successfully!", "success");
      router.push("/apps/installed/calendar");
    } catch {
      // Removed the unused 'err' variable here to satisfy Biome
      showToast("Please provide a valid Proton ICS URL", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppFormLayout app={app}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">Connect your Proton Calendar</h3>
          <p className="text-sm text-gray-500">
            Paste your "Full view" ICS link from Proton Settings to sync availability.
          </p>
        </div>

        <TextField
          label="Proton ICS Link"
          placeholder="https://calendar.proton.me/api/calendar/v1/share/..."
          value={url}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
          required
        />

        <div className="flex justify-end">
          <Button type="submit" loading={loading}>
            Connect Calendar
          </Button>
        </div>
      </form>
    </AppFormLayout>
  );
}
