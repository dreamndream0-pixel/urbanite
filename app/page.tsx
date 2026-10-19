import Storefront from '@/app/components/Storefront';
import { getStorefrontBootstrap } from '@/lib/storefront-bootstrap';

export default async function Home() {
  return <Storefront initialData={await getStorefrontBootstrap()} />;
}
