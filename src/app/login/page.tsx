import { LoginClient } from "./LoginClient";

export default async function LoginPage(): Promise<React.ReactNode> {
  // const db = getDb()
  // const superadmins = await db.selectFrom('users').select(({ fn }) => fn.count<number>('id').as('c')).where('role', '=', 'superadmin').executeTakeFirst()
  // if ((superadmins?.c || 0) === 0) redirect('/setup')
  return <LoginClient />;
}
