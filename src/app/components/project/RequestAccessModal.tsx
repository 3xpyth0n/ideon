
"use client";

import { useState, useEffect } from "react";
import { useI18n } from "@providers/I18nProvider";
import { Button } from "@components/ui/Button";
import { Loader2, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { Modal } from "@components/ui/Modal";
import { toast } from "sonner";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { useUser } from "@providers/UserProvider";

interface RequestAccessModalProps {
  projectId: string;
  projectName?: string;
  initialStatus?: "pending" | "rejected" | null;
}

export function RequestAccessModal({
  projectId,
  projectName,
  initialStatus = null,
}: RequestAccessModalProps) {
  const { dict } = useI18n();
  const router = useRouter();
  const { user } = useUser();
  const [status, setStatus] = useState<"pending" | "rejected" | null>(
    initialStatus,
  );
  const [loading, setLoading] = useState(false);

  // Listen for access granted
  useEffect(() => {
    if (status !== "pending" || !user) return;

    const doc = new Y.Doc();
    const wsProvider = new WebsocketProvider(
      `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${
        window.location.host
      }/yjs`,
      `project-${projectId}-access`,
      doc,
      { connect: true, params: {} }
    );

    const metaMap = doc.getMap("meta");
    const checkAccess = () => {
      const granted = metaMap.get(`granted:${user.id}`);
      if (granted) {
        toast.success(dict.project.accessGranted || "Access granted! Redirecting...");
        router.refresh();
      }
    };

    metaMap.observe(checkAccess);
    
    // Check initial state
    if (metaMap.get(`granted:${user.id}`)) {
      checkAccess();
    }

    return () => {
      wsProvider.destroy();
      doc.destroy();
    };
  }, [projectId, status, user, router, dict.project.accessGranted]);

  const handleRequestAccess = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/request-access`, {
        method: "POST",
      });

      if (res.ok) {
        setStatus("pending");
        toast.success(dict.project.requestSent || "Request sent successfully");
      } else {
        const data = await res.json().catch(() => ({}));
        if (data.status === "rejected") {
          setStatus("rejected");
        } else if (data.status === "pending") {
          setStatus("pending");
          toast.info(dict.project.requestAlreadyPending || "Request already pending");
        } else {
          // Generic error handling
          const errorMsg = data.error || res.statusText;
          console.error("Request access failed:", errorMsg);
          toast.error(errorMsg || "Failed to request access");
        }
      }
    } catch (err) {
      console.error("Failed to request access", err);
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={() => router.push("/home")}
      showCloseButton={false}
      className="max-w-md w-full text-center p-4"
    >
      <div className="flex flex-col items-center justify-center py-6">
        <div className="flex justify-center mb-6 text-muted bg-muted/10 p-4 rounded-full">
          <Lock size={32} />
        </div>
        
        <h2 className="text-xl font-bold mb-2">
          {dict.project.accessDenied || "Access Denied"}
        </h2>
        
        <p className="text-muted mb-8 max-w-[80%] mx-auto text-sm">
          {projectName
            ? `You don't have access to "${projectName}".`
            : "You don't have access to this project."}
        </p>

        <div className="w-full max-w-md mx-auto">
          {status === "pending" ? (
            <div className="flex flex-col gap-4">
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-md text-yellow-500 text-sm">
                <p className="font-medium">
                  {dict.project.requestPending || "Request Pending"}
                </p>
                <p className="opacity-80 mt-1 text-xs">
                  {dict.project.requestPendingDesc ||
                    "Your request has been sent to the project owner."}
                </p>
              </div>
              <button
                onClick={() => router.push("/home")}
                className="text-muted hover:text-foreground text-xs underline underline-offset-4 bg-transparent border-none cursor-pointer mx-auto"
              >
                {dict.common.backToHome || "Back to Home"}
              </button>
            </div>
          ) : status === "rejected" ? (
            <div className="flex flex-col gap-4">
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-md text-red-500 text-sm">
                <p className="font-medium">
                  {dict.project.requestRejected || "Request Rejected"}
                </p>
                <p className="opacity-80 mt-1 text-xs">
                  {dict.project.requestRejectedDesc ||
                    "Your request has been rejected by the project owner."}
                </p>
              </div>
              <button
                onClick={() => router.push("/home")}
                className="text-muted hover:text-foreground text-xs underline underline-offset-4 bg-transparent border-none cursor-pointer mx-auto"
              >
                {dict.common.backToHome || "Back to Home"}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-6">
              <Button
                onClick={handleRequestAccess}
                disabled={loading}
                className="btn-primary"
              >
                {loading ? (
                  <Loader2 className="animate-spin mr-2" size={16} />
                ) : null}
                {dict.project.requestAccess || "Request Access"}
              </Button>
              <button
                onClick={() => router.push("/home")}
                className="text-muted hover:text-foreground text-sm font-medium hover:underline underline-offset-4 bg-transparent border-none cursor-pointer"
              >
                {dict.common.backToHome || "Back to Home"}
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
