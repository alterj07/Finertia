"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type HealthResponse = {
  status: string;
  app: string;
};

export default function Home() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<HealthResponse>("/api/health")
      .then(setHealth)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Unknown error"),
      );
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Finertia</CardTitle>
          <CardDescription>Backend health check</CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-destructive text-sm">Error: {error}</p>
          ) : health ? (
            <p className="text-sm">
              {health.app}: <span className="font-medium">{health.status}</span>
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">Loading…</p>
          )}
          <Button render={<Link href="/chat" />} className="mt-4 w-full">
            Open Finertia Assistant
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
