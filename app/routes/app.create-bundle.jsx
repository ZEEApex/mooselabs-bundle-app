import { Page, Layout, Card, BlockStack, TextField, Button, Select } from "@shopify/polaris";
import { useState, useEffect, useRef, useCallback } from "react";
import { SaveBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { Form, useNavigate, useNavigation, redirect } from "react-router";
import db from "../db.server";

import BundleSetupUI from "../components/BundleSetupUI.jsx";

// --- BACKEND: THE ACTION THAT CATCHES THE FORM SUBMISSION ---
export const action = async ({ request }) => {
  // 1. Authenticate the user and get their shop URL
  const { session } = await authenticate.admin(request);
  
  // 2. Grab the data from the form
  const formData = await request.formData();
  const bundleName = formData.get("bundleName");
  const bundleConfiguration = formData.get("bundleConfiguration");
  const status = formData.get("status"); // <--- Grab the status from the form

  // 3. Save it to our Prisma Database!
  await db.bundle.create({
    data: {
      shop: session.shop,
      name: bundleName || "Unnamed Bundle",
      status: status || "DRAFT", // <--- Save the selected status
      configuration: bundleConfiguration, 
    }
  });

  // 4. Redirect them back to the main dashboard when done
  return redirect("/app");
};


const SAVE_BAR_ID = "bundle-create-save-bar";

// --- FRONTEND: THE UI ---
export default function CreateBundle() {
  const [bundleName, setBundleName] = useState("");
  const [status, setStatus] = useState("ACTIVE"); // <--- State for Status
  const navigate = useNavigate();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const formRef = useRef(null);

  const [dirty, setDirty] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const markDirty = useCallback(() => setDirty(true), []);

  const isSaving = navigation.state === "submitting";

  useEffect(() => {
    if (!shopify?.saveBar) return;
    if (dirty) shopify.saveBar.show(SAVE_BAR_ID);
    else shopify.saveBar.hide(SAVE_BAR_ID);
  }, [dirty, shopify]);

  useEffect(() => {
    if (navigation.state === "idle") setDirty(false);
  }, [navigation.state]);

  const handleSave = () => {
    formRef.current?.requestSubmit();
  };

  const handleDiscard = () => {
    setBundleName("");
    setStatus("ACTIVE");
    setResetKey((k) => k + 1); // remounts the builder back to an empty bundle
    setDirty(false);
  };

  return (
    <Page
      title="Create New Bundle"
      backAction={{ content: 'Bundles', onAction: () => navigate('/app') }}
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
                    placeholder="e.g. MouthPeace Micro Bundle"
                  />
                </BlockStack>
              </Card>

              {/* Injects our dynamic UI and the hidden JSON input */}
              <BundleSetupUI key={resetKey} onChange={markDirty} />

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
                    {isSaving ? "Saving..." : "Save Bundle"}
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