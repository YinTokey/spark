import Capture from '@/components/capture';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSparkRepository } from '@/lib/server/spark-repository';
import { authenticateAccessToken } from '@/lib/server/session';

export default async function HomePage() {
  const accessToken = (await cookies()).get('spark-access-token')?.value;
  if (!accessToken || !await authenticateAccessToken(accessToken)) redirect('/');

  let initialLibrary;
  let libraryError = false;
  try {
    initialLibrary = await createSparkRepository(accessToken).loadLibrary();
  } catch {
    libraryError = true;
  }
  return <Capture initialLibrary={initialLibrary} libraryError={libraryError} />;
}
