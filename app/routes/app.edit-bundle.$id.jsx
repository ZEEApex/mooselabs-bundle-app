import { Page, Layout, Card, BlockStack, TextField, Button, Badge, Select } from "@shopify/polaris";
import { useState, useEffect, useRef, useCallback } from "react";
import { Form, useNavigate, useLoaderData, useNavigation, redirect } from "react-router";
import { SaveBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

import BundleSetupUI from "../components/BundleSetupUI.jsx";

// --- BACKEND: FETCH SAVED DATA ---
export const loader = async ({ request, params }) => {
  await authenticate.admin(request);
  const bundle = await db.bundle.findUnique({
    where: { id: params.id }
  });
  return { bundle };
};

// --- BACKEND: UPDATE DATA ---
export const action = async ({ request, params }) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  
  const bundleName = formData.get("bundleName");
  const bundleConfiguration = formData.get("bundleConfiguration"); 
  const status = formData.get("status"); // <--- Grab the status from the form

  await db.bundle.update({
    where: { id: params.id },
    data: {
      name: bundleName,
      status: status, // <--- Update the status in the DB
      configuration: bundleConfiguration
    }
  });

  return redirect("/app");
};

// --- FRONTEND ---
const SAVE_BAR_ID = "bundle-edit-save-bar";

export default function EditBundle() {
  const { bundle } = useLoaderData();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const formRef = useRef(null);

  // Set the states from the DB
  const [bundleName, setBundleName] = useState(bundle?.name || "Unnamed Bundle");
  const [status, setStatus] = useState(bundle?.status || "DRAFT"); // <--- State for Status

  // Unsaved-changes tracking for the contextual save bar.
  const [dirty, setDirty] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const markDirty = useCallback(() => setDirty(true), []);

  // Parse the JSON configuration from the DB to pass to the UI
  const initialConfig = bundle?.configuration ? JSON.parse(bundle.configuration) : null;
  const isSaving = navigation.state === "submitting";

  // Show/hide Shopify's contextual save bar as the form becomes dirty/clean.
  useEffect(() => {
    if (!shopify?.saveBar) return;
    if (dirty) shopify.saveBar.show(SAVE_BAR_ID);
    else shopify.saveBar.hide(SAVE_BAR_ID);
  }, [dirty, shopify]);

  // Once a save finishes (route redirects / revalidates), it's clean again.
  useEffect(() => {
    if (navigation.state === "idle") setDirty(false);
  }, [navigation.state]);

  const handleSave = () => {
    formRef.current?.requestSubmit();
  };

  const handleDiscard = () => {
    setBundleName(bundle?.name || "Unnamed Bundle");
    setStatus(bundle?.status || "DRAFT");
    setResetKey((k) => k + 1); // remounts the builder with the saved config
    setDirty(false);
  };

  return (
    <Page
      title={`Editing: ${bundleName}`}
      backAction={{ content: 'Bundles', onAction: () => navigate('/app') }}
      titleMetadata={<Badge tone={status === "ACTIVE" ? "success" : "attention"}>{status}</Badge>}
    >
      <SaveBar id={SAVE_BAR_ID}>
        <button variant="primary" onClick={handleSave} loading={isSaving ? "" : undefined}>
          Save
        </button>
        <button onClick={handleDiscard}>Discard</button>
      </SaveBar>
      <Form method="post" ref={formRef}>
        <input type="hidden" name="status" value={status} /> {/* <--- Hidden input for the backend */}
        <Layout>
          <Layout.Section>
            <BlockStack gap="500">
              
              <Card>
                <BlockStack gap="400">
                  <TextField
                    label="Bundle Name"
                    name="bundleName"
                    value={bundleName}
                    onChange={(val) => { setBundleName(val); markDirty(); }}
                    autoComplete="off"
                  />
                </BlockStack>
              </Card>

              {/* INJECT SAVED DATA INTO THE UI COMPONENT */}
              <BundleSetupUI key={resetKey} initialData={initialConfig} onChange={markDirty} />

            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              {/* <--- Status Card added to Sidebar ---> */}
              <Card>
                <BlockStack gap="400">
                  <Select
                    label="Status"
                    options={[
                      { label: 'Active', value: 'ACTIVE' },
                      { label: 'Draft', value: 'DRAFT' }
                    ]}
                    value={status}
                    onChange={(val) => { setStatus(val); markDirty(); }}
                  />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Button submit variant="primary" size="large" fullWidth loading={isSaving}>
                    {isSaving ? "Updating..." : "Update Bundle"}
                  </Button>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Form>
    </Page>
  );
}