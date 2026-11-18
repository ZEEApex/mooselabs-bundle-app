import { Outlet, useLoaderData, useRouteError, useNavigation } from "react-router";
import { useEffect } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useAppBridge } from "@shopify/app-bridge-react";

// --- NEW POLARIS IMPORTS ---
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticate } from "../shopify.server";

// Shows Shopify's native top loading bar whenever a route is navigating or a
// form is submitting, so page transitions never feel "frozen".
function NavigationLoader() {
  const navigation = useNavigation();
  const shopify = useAppBridge();

  useEffect(() => {
    const busy = navigation.state !== "idle";
    try {
      shopify?.loading?.(busy);
    } catch (e) {
      // App Bridge loading is best-effort; never block the UI on it.
    }
  }, [navigation.state, shopify]);

  return null;
}

// Inject Polaris CSS into the app
export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    // Wrap the entire app in the Polaris App Provider
    <PolarisAppProvider i18n={enTranslations}>
      <AppProvider embedded apiKey={apiKey}>
        <NavigationLoader />
        <s-app-nav>
          <s-link href="/app">Home</s-link>
          <s-link href="/app/analytics">Analytics</s-link>
          <s-link href="/app/create-bundle">Create Bundle</s-link>
          <s-link href="/app/create-pbf26">Create PBF26</s-link>
        </s-app-nav>
        <Outlet />
      </AppProvider>
    </PolarisAppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() { 
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};