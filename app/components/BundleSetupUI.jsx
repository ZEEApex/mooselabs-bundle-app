import { useState } from 'react';
import { 
  Card, BlockStack, InlineStack, Text, Button, 
  TextField, Checkbox, Collapsible, Divider, Box, 
  Select, Thumbnail, Layout 
} from '@shopify/polaris';
import { ChevronDownIcon, ChevronUpIcon, DeleteIcon, PlusIcon, ImageIcon } from '@shopify/polaris-icons';

export default function BundleSetupUI({ initialData }) {
  
  const [parentProduct, setParentProduct] = useState(initialData?.parentProduct || null);

  const [steps, setSteps] = useState(initialData?.steps || [
    {
      id: Date.now().toString(),
      name: 'Step 1',
      categories: [
        {
          id: Date.now().toString() + '-cat',
          name: 'Category 1',
          title: 'Add at least 1 item',
          displayVariantsAsProducts: false,
          isExpanded: true,
          hideVariantsByMetafield: false,
          products: [],
          rule: { type: 'Quantity', condition: '>=', value: '1' } 
        }
      ]
    }
  ]);

  const [discount, setDiscount] = useState(initialData?.discount || {
    enabled: true,
    type: 'Percentage Off',
    value: '10',
    ruleText: 'Add 1 product to get 10% OFF discount!',
    successMessage: "Sweet! You've scored 10% OFF your bundle!"
  });

  // --- SHOPIFY RESOURCE PICKER LOGIC ---
  const openResourcePicker = async (isParent = false, stepIndex = null, catIndex = null) => {
    if (!window.shopify) {
      alert("App Bridge is not available.");
      return;
    }

    const selected = await window.shopify.resourcePicker({
      type: 'product',
      multiple: !isParent,
    });

    if (!selected || selected.length === 0) return;

    if (isParent) {
      const product = selected[0];
      const firstVariant = product.variants?.[0];
      setParentProduct({
        id: product.id,
        variantId: firstVariant?.id || "",
        title: product.title,
        image: product.images?.[0]?.originalSrc || product.featuredImage?.url || ""
      });
    } else {
      const newSteps = [...steps];
      const existingProducts = newSteps[stepIndex].categories[catIndex].products;

      const newProducts = [];
      selected.forEach(product => {
        product.variants?.forEach(variant => {
          const variantTitle = variant.title === "Default Title" ? "" : variant.title;
          const displayTitle = variantTitle
            ? `${product.title} (${variantTitle})`
            : product.title;

          // Avoid duplicates
          const alreadyAdded = existingProducts.some(p => p.variantId === variant.id);
          if (!alreadyAdded) {
            newProducts.push({
              id: product.id,
              variantId: variant.id,
              handle: product.handle || "", // NEW: Grabbing handle
              price: parseFloat(variant.price) || 0, // NEW: Grabbing price
              title: displayTitle,
              image: variant.image?.originalSrc
                  || product.images?.[0]?.originalSrc
                  || product.featuredImage?.url
                  || ""
            });
          }
        });
      });

      newSteps[stepIndex].categories[catIndex].products = [...existingProducts, ...newProducts];
      setSteps(newSteps);
    }
  };

  const removeCategoryProduct = (stepIndex, catIndex, prodIndex) => {
    const newSteps = [...steps];
    newSteps[stepIndex].categories[catIndex].products.splice(prodIndex, 1);
    setSteps(newSteps);
  }

  // --- CATEGORY ACTIONS ---
  const addStep = () => {
    setSteps([...steps, { id: Date.now().toString(), name: `Step ${steps.length + 1}`, categories: [] }]);
  };

  const addCategory = (stepIndex) => {
    const newSteps = [...steps];
    newSteps[stepIndex].categories.push({
      id: Date.now().toString(),
      name: `Category ${newSteps[stepIndex].categories.length + 1}`,
      title: '',
      displayVariantsAsProducts: false,
      isExpanded: true,
      products: [],
      rule: { type: 'Quantity', condition: '>=', value: '1' }
    });
    setSteps(newSteps);
  };

  const toggleCategory = (stepIndex, catIndex) => {
    const newSteps = [...steps];
    newSteps[stepIndex].categories[catIndex].isExpanded = !newSteps[stepIndex].categories[catIndex].isExpanded;
    setSteps(newSteps);
  };

  const updateCategory = (stepIndex, catIndex, field, value) => {
    const newSteps = [...steps];
    newSteps[stepIndex].categories[catIndex][field] = value;
    setSteps(newSteps);
  };

  const updateCategoryRule = (stepIndex, catIndex, field, value) => {
    const newSteps = [...steps];
    newSteps[stepIndex].categories[catIndex].rule[field] = value;
    setSteps(newSteps);
  };

  const removeCategory = (stepIndex, catIndex) => {
    const newSteps = [...steps];
    newSteps[stepIndex].categories.splice(catIndex, 1);
    setSteps(newSteps);
  };

  const removeStep = (stepIndex) => {
    const newSteps = [...steps];
    newSteps.splice(stepIndex, 1);
    setSteps(newSteps);
  };

  return (
    <BlockStack gap="500">
      
      {/* 1. PARENT PRODUCT SELECTION CARD */}
      <Card roundedAbove="sm">
        <BlockStack gap="400">
          <Text variant="headingMd" as="h2">Bundle Product</Text>
          <Text variant="bodySm" tone="subdued">Select the parent product that will act as the container for this bundle at checkout.</Text>
          
          <Box padding="400" borderWidth="025" borderColor="border" borderRadius="100" background="bg-surface-secondary">
            {parentProduct ? (
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="400" blockAlign="center">
                  <Thumbnail source={parentProduct.image || ImageIcon} alt={parentProduct.title} size="small" />
                  <Text variant="bodyMd" fontWeight="bold">{parentProduct.title}</Text>
                </InlineStack>
                <Button onClick={() => openResourcePicker(true)}>Change Product</Button>
              </InlineStack>
            ) : (
              <BlockStack align="center" inlineAlign="center" gap="200">
                <Button size="medium" variant="primary" onClick={() => openResourcePicker(true)}>
                  Select Parent Product
                </Button>
              </BlockStack>
            )}
          </Box>
        </BlockStack>
      </Card>

      {/* 2. STEPS & CATEGORIES BUILDER */}
      {steps.map((step, stepIndex) => (
        <Card key={step.id} roundedAbove="sm">
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="headingMd" as="h2">Step Setup: {step.name}</Text>
              <Button tone="critical" variant="plain" icon={DeleteIcon} onClick={() => removeStep(stepIndex)}>Remove Step</Button>
            </InlineStack>
            
            <TextField label="Step Name" value={step.name} onChange={(val) => {
                const newSteps = [...steps];
                newSteps[stepIndex].name = val;
                setSteps(newSteps);
              }} autoComplete="off" 
            />
            <Divider />
            
            <Text variant="headingSm" as="h3">Categories</Text>

            {step.categories.map((cat, catIndex) => (
              <Box key={cat.id} padding="400" borderWidth="025" borderColor="border" borderRadius="100">
                <BlockStack gap="400">
                  
                  {/* Category Header */}
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="300" blockAlign="center">
                      <Button icon={cat.isExpanded ? ChevronUpIcon : ChevronDownIcon} variant="tertiary" onClick={() => toggleCategory(stepIndex, catIndex)} />
                      <Text variant="headingSm" as="h4">{cat.name || "Unnamed Category"}</Text>
                    </InlineStack>
                    <Button icon={DeleteIcon} tone="critical" variant="plain" onClick={() => removeCategory(stepIndex, catIndex)} />
                  </InlineStack>

                  {/* Category Body */}
                  <Collapsible open={cat.isExpanded} id={`cat-${cat.id}`} transition={{ duration: '200ms', timingFunction: 'ease-in-out' }}>
                    <BlockStack gap="400">
                      
                      <Box paddingBlockStart="200">
                        <TextField label="Category Name (Internal)" value={cat.name} onChange={(val) => updateCategory(stepIndex, catIndex, 'name', val)} autoComplete="off" />
                      </Box>
                      <TextField label="Category Title (Visible to customers)" value={cat.title} onChange={(val) => updateCategory(stepIndex, catIndex, 'title', val)} autoComplete="off" />

                      <Box padding="300" background="bg-surface-secondary" borderRadius="100">
                        <BlockStack gap="300">
                          <Text variant="headingXs" as="h5">Rules Configuration</Text>
                          <InlineStack gap="300">
                            <Box minWidth="150px">
                              <Select 
                                labelHidden label="Rule Type"
                                options={[{label: 'Quantity', value: 'Quantity'}, {label: 'Amount', value: 'Amount'}]}
                                value={cat.rule.type}
                                onChange={(val) => updateCategoryRule(stepIndex, catIndex, 'type', val)}
                              />
                            </Box>
                            <Box minWidth="200px">
                              <Select 
                                labelHidden label="Condition"
                                options={[
                                  {label: 'is greater than or equal to', value: '>='}, 
                                  {label: 'is less than or equal to', value: '<='},
                                  {label: 'is equal to', value: '=='}
                                ]}
                                value={cat.rule.condition}
                                onChange={(val) => updateCategoryRule(stepIndex, catIndex, 'condition', val)}
                              />
                            </Box>
                            <TextField 
                              labelHidden label="Value" type="number"
                              value={cat.rule.value} 
                              onChange={(val) => updateCategoryRule(stepIndex, catIndex, 'value', val)} 
                              autoComplete="off" 
                            />
                          </InlineStack>
                        </BlockStack>
                      </Box>

                      <Box padding="400" borderWidth="025" borderColor="border" borderRadius="100">
                        <BlockStack gap="300">
                          <InlineStack align="space-between" blockAlign="center">
                            <Text variant="headingXs" as="h5">Products ({cat.products.length})</Text>
                            <Button size="small" onClick={() => openResourcePicker(false, stepIndex, catIndex)}>Add Products</Button>
                          </InlineStack>
                          
                          {!cat.hideVariantsByMetafield ? (
                          cat.products.length > 0 && (
                            <BlockStack gap="200">
                              {cat.products.map((prod, prodIndex) => (
                                <InlineStack key={prodIndex} align="space-between" blockAlign="center">
                                  <InlineStack gap="300" blockAlign="center">
                                    <Thumbnail source={prod.image || ImageIcon} alt={prod.title} size="small" />
                                    <Text variant="bodySm">{prod.title}</Text>
                                  </InlineStack>
                                  <Button variant="plain" tone="critical" icon={DeleteIcon} onClick={() => removeCategoryProduct(stepIndex, catIndex, prodIndex)}/>
                                </InlineStack>
                              ))}
                            </BlockStack>
                          )
                        ) : (
                          <Text variant="bodySm" tone="subdued">Variants hidden by metafield.</Text>
                        )
                        </BlockStack>
                      </Box>

                      <Checkbox
                        label="Display variants as individual products"
                        checked={cat.displayVariantsAsProducts}
                        onChange={(val) => updateCategory(stepIndex, catIndex, 'displayVariantsAsProducts', val)}
                      />
                      <Checkbox
                        label="Hide variants with metafield `custom.hide_variant` set to true"
                        checked={cat.hideVariantsByMetafield}
                        onChange={(val) => updateCategory(stepIndex, catIndex, 'hideVariantsByMetafield', val)}
                      />
                    </BlockStack>
                  </Collapsible>
                </BlockStack>
              </Box>
            ))}

            <InlineStack align="start">
              <Button icon={PlusIcon} variant="plain" onClick={() => addCategory(stepIndex)}>Add Category</Button>
            </InlineStack>
          </BlockStack>
        </Card>
      ))}

      <InlineStack align="center">
        <Button icon={PlusIcon} size="large" onClick={addStep}>Add Step</Button>
      </InlineStack>

      {/* 3. DISCOUNT & PRICING ENGINE */}
      <Card roundedAbove="sm">
        <BlockStack gap="400">
          <InlineStack align="space-between">
            <Text variant="headingMd" as="h2">Discount & Pricing</Text>
            <Checkbox checked={discount.enabled} onChange={(val) => setDiscount({...discount, enabled: val})} />
          </InlineStack>
          <Text variant="bodySm" tone="subdued">Set up discount rules, applied from lowest to highest.</Text>

          <Select 
            label="Discount Type"
            options={[
              {label: 'Percentage Off', value: 'Percentage Off'},
              {label: 'Fixed Amount Off', value: 'Fixed Amount Off'},
              {label: 'Fixed Bundle Price', value: 'Fixed Bundle Price'}
            ]}
            value={discount.type}
            onChange={(val) => setDiscount({...discount, type: val})}
          />
          
          <TextField 
            label="Discount Value" type="number"
            value={discount.value} 
            onChange={(val) => setDiscount({...discount, value: val})} 
            autoComplete="off" 
            prefix={discount.type === 'Percentage Off' ? '%' : '$'}
          />

          <Divider />

          <Text variant="headingSm" as="h3">Discount Messaging</Text>
          <TextField 
            label="Discount Text (Rule #1)" 
            value={discount.ruleText} 
            onChange={(val) => setDiscount({...discount, ruleText: val})} 
            autoComplete="off" 
          />
          <TextField 
            label="Success Message" 
            value={discount.successMessage} 
            onChange={(val) => setDiscount({...discount, successMessage: val})} 
            autoComplete="off" 
          />

        </BlockStack>
      </Card>

      <input type="hidden" name="bundleConfiguration" value={JSON.stringify({ parentProduct, steps, discount })} />
    </BlockStack>
  );
}