import { auth, signOut } from "@/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DangerZone } from "@/components/shared/danger-zone";

export default async function SettingsPage() {
  const session = await auth();

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your account information.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            {session?.user?.image && (
              <img
                src={session.user.image}
                alt={session.user.name ?? ""}
                className="h-16 w-16 rounded-full"
              />
            )}
            <div>
              <p className="text-lg font-medium">{session?.user?.name}</p>
              <p className="text-sm text-muted-foreground">{session?.user?.email}</p>
            </div>
          </div>

          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button type="submit" variant="outline">
              Sign Out
            </Button>
          </form>
        </CardContent>
      </Card>

      <DangerZone userEmail={session?.user?.email ?? ""} />
    </div>
  );
}
