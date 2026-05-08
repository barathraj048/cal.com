import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button, showToast, TextField } from "@calcom/ui";
import type { GetServerSidePropsContext } from "next";
import { useRouter } from "next/router";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useState } from "react";

export default function ProtonSetupPage(): JSX.Element {
  const router = useRouter();
  const { t } = useLocale();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/integrations/protoncalendar/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [url] }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.message || "Invalid Proton ICS URL");
      }

      showToast(t("proton_calendar_connected_success") || "Connected successfully!", "success");
      router.push(data?.url || "/apps/installed/calendar");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : t("proton_calendar_add_error") || "Invalid Proton ICS URL",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto mt-8 max-w-md">
      <h1 className="mb-4 text-2xl font-bold">Setup Proton Calendar</h1>
      <p className="mb-4 text-gray-600">Paste your Proton Calendar ICS feed URL below.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <TextField
          label="ICS Feed URL"
          placeholder="https://calendar.proton.me/..."
          value={url}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
          required
        />

        <div className="flex justify-end">
          <Button type="submit" loading={loading}>
            {loading ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export const getServerSideProps = async (ctx: GetServerSidePropsContext) => {
  const { req, locale } = ctx;
  const session = await getServerSession({ req });

  if (!session?.user?.id) {
    return {
      redirect: {
        destination: "/auth/login",
        permanent: false,
      },
    };
  }

  return {
    props: {
      ...(await serverSideTranslations(locale || "en", ["common"])),
    },
  };
};
