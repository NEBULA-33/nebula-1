import { loadInitialData, importData, exportData } from './dataManager.js';
import { initializeUIManager, renderAll } from './uiManager.js';
import { initializeAuthManager, applyRolePermissions } from './authManager.js';
import { initializeProductManager } from './productManager.js';
import { initializeSalesManager } from './salesManager.js';
import { initializeStockManager } from './stockManager.js';
import { initializeDebtManager } from './debtManager.js';
import { initializeReportsManager } from './reportsManager.js';
import { initializeButcheringManager } from './butcheringManager.js';
import { initializeNotesManager } from './notesManager.js';
import { initializeSettingsManager } from './settingsManager.js';
import { initializePurchaseManager } from './purchaseManager.js'; 

document.addEventListener('DOMContentLoaded', () => {
    // Bu obje, HTML'deki tüm önemli elementleri ID'leri ile bulur ve diğer scriptlerin kullanımına sunar.
    const uiElements = {
        loginOverlay: document.getElementById('login-overlay'),
        mainContainer: document.querySelector('.main-container'),
        logoutBtn: document.getElementById('logout-btn'),
        roleSelection: document.getElementById('role-selection'),
        showManagerLoginBtn: document.getElementById('show-manager-login-btn'),
        managerLoginForm: document.getElementById('manager-login-form'),
        managerPasswordInput: document.getElementById('manager-password'),
        passwordErrorMessage: document.getElementById('password-error-message'),
        salesMessage: document.getElementById('sales-message'),
        barcodeSellForm: document.getElementById('barcode-sell-form'),
        barcodeScanInput: document.getElementById('barcode-scan-input'),
        quickAddContainer: document.getElementById('quick-add-container'),
        cartItemsContainer: document.getElementById('cart-items-container'),
        subtotal: document.getElementById('subtotal'),
        vatBreakdown: document.getElementById('vat-breakdown'),
        grandTotal: document.getElementById('grand-total'),
        completeSaleBtn: document.getElementById('complete-sale-btn'),
        clearCartBtn: document.getElementById('clear-cart-btn'),
        salesChannelSelect: document.getElementById('sales-channel-select'),
        productListContainer: document.getElementById('product-list-container'),
        productForm: document.getElementById('product-form'),
        editProductIdInput: document.getElementById('edit-product-id'),
        productNameInput: document.getElementById('product-name'),
        productCategoryInput: document.getElementById('product-category'),
        productVatRateSelect: document.getElementById('product-vat-rate'),
        isWeighableCheckbox: document.getElementById('is-weighable'),
        showInQuickAddCheckbox: document.getElementById('show-in-quick-add'),
        pluSection: document.getElementById('plu-section'),
        barcodeSection: document.getElementById('barcode-section'),
        pluCodesContainer: document.getElementById('plu-codes-container'),
        addPluBtn: document.getElementById('add-plu-btn'),
        productBarcodeInput: document.getElementById('product-barcode'),
        purchasePriceInput: document.getElementById('purchase-price'),
        sellingPriceInput: document.getElementById('selling-price'),
        stockQuantityInput: document.getElementById('stock-quantity'),
        productSubmitBtn: document.getElementById('product-submit-btn'),
        cancelEditBtn: document.getElementById('cancel-edit-btn'),
        stockInForm: document.getElementById('stock-in-form'),
        stockInBarcodeScanInput: document.getElementById('stock-in-barcode-scan-input'),
        stockInListContainer: document.getElementById('stock-in-list-container'),
        confirmStockInBtn: document.getElementById('confirm-stock-in-btn'),
        stockInMessage: document.getElementById('stock-in-message'),
        wastageForm: document.getElementById('wastage-form'),
        wastageFormContainer: document.getElementById('wastage-form').parentElement,
        wastageProductSelect: document.getElementById('wastage-product-select'),
        wastageQuantityInput: document.getElementById('wastage-quantity-input'),
        wastageReasonSelect: document.getElementById('wastage-reason-select'),
        wastageMessage: document.getElementById('wastage-message'),
        returnForm: document.getElementById('return-form'),
        returnFormContainer: document.getElementById('return-form').parentElement,
        returnProductSelect: document.getElementById('return-product-select'),
        returnQuantityInput: document.getElementById('return-quantity-input'),
        returnReasonSelect: document.getElementById('return-reason-select'),
        returnMessage: document.getElementById('return-message'),
        subTabsContainer: document.querySelector('.sub-tabs'),
        debtForm: document.getElementById('debt-form'),
        debtPersonId: document.getElementById('debt-person-id'),
        debtPersonName: document.getElementById('debt-person-name'),
        debtPersonPhone: document.getElementById('debt-person-phone'),
        debtPersonAddress: document.getElementById('debt-person-address'),
        debtAmount: document.getElementById('debt-amount'),
        debtDescription: document.getElementById('debt-description'),
        debtSubmitButton: document.getElementById('debt-submit-button'),
        clearDebtFormButton: document.getElementById('clear-debt-form-button'),
        debtSearchInput: document.getElementById('debt-search-input'),
        debtListContainer: document.getElementById('debt-list-container'),
        debtSaleContainer: document.getElementById('debt-sale-container'),
        debtSalePersonSelect: document.getElementById('debt-sale-person-select'),
        debtSaleForm: document.getElementById('debt-sale-form'),
        debtSaleBarcodeScan: document.getElementById('debt-sale-barcode-scan'),
        debtSaleCartContainer: document.getElementById('debt-sale-cart-container'),
        debtSaleTotal: document.getElementById('debt-sale-total'),
        debtSaleConfirmBtn: document.getElementById('debt-sale-confirm-btn'),
        debtSaleClearBtn: document.getElementById('debt-sale-clear-btn'),
        debtSaleMessage: document.getElementById('debt-sale-message'),
        noteForm: document.getElementById('note-form'),
        noteContent: document.getElementById('note-content'),
        noteListContainer: document.getElementById('note-list-container'),
        reportsTab: document.querySelector('[data-tab="reports"]'),
        reportHub: document.getElementById('report-hub'),
        reportDisplay: document.getElementById('report-display'),
        backToHubBtn: document.getElementById('back-to-hub-btn'),
        reportDisplayTitle: document.getElementById('report-display-title'),
        reportDisplayContent: document.getElementById('report-display-content'),
        butcheringTab: document.querySelector('[data-tab="butchering"]'),
        butcheringRecipeForm: document.getElementById('butchering-recipe-form'),
        editRecipeId: document.getElementById('edit-recipe-id'),
        recipeName: document.getElementById('recipe-name'),
        recipeSourceProduct: document.getElementById('recipe-source-product'),
        recipeOutputsContainer: document.getElementById('recipe-outputs-container'),
        addRecipeOutputBtn: document.getElementById('add-recipe-output-btn'),
        saveRecipeBtn: document.getElementById('save-recipe-btn'),
        cancelRecipeEditBtn: document.getElementById('cancel-recipe-edit-btn'),
        executeButcheringForm: document.getElementById('execute-butchering-form'),
        butcherRecipeSelect: document.getElementById('butcher-recipe-select'),
        butcherQuantityInput: document.getElementById('butcher-quantity-input'),
        butcherMessage: document.getElementById('butcher-message'),
        recipeListContainer: document.getElementById('recipe-list-container'),
        butcherSourceScanInput: document.getElementById('butcher-source-scan-input'),
        scannedSourceProductName: document.getElementById('scanned-source-product-name'),
        settingsTab: document.querySelector('[data-tab="settings"]'),
        exportDataBtn: document.getElementById('export-data-btn'),
        importDataBtn: document.getElementById('import-data-btn'),
        importFileInput: document.getElementById('import-file-input'),
        accessLogContainer: document.getElementById('access-log-container'),
        auditLogContainer: document.getElementById('audit-log-container'),
        reasonManagementForm: document.getElementById('reason-management-form'),
        newReasonInput: document.getElementById('new-reason-input'),
        reasonListContainer: document.getElementById('reason-list-container'),
        channelManagementForm: document.getElementById('channel-management-form'),
        newChannelInput: document.getElementById('new-channel-input'),
        channelListContainer: document.getElementById('channel-list-container'),
        sideNavbar: document.querySelector('.side-navbar'),
         shopSelect: document.getElementById('shop-select'),
         supplierForm: document.getElementById('supplier-form'),
supplierNameInput: document.getElementById('supplier-name-input'),
supplierContactInput: document.getElementById('supplier-contact-input'),
supplierPhoneInput: document.getElementById('supplier-phone-input'),
supplierMessage: document.getElementById('supplier-message'),
purchaseInvoiceForm: document.getElementById('purchaseInvoiceForm'),
invoiceSupplierSelect: document.getElementById('invoice-supplier-select'),
invoiceDateInput: document.getElementById('invoice-date-input'),
confirmPurchaseBtn: document.getElementById('confirm-purchase-btn'),
        
        // YENİ EKLENEN SATIRLAR
        purchaseBarcodeForm: document.getElementById('purchase-barcode-form'),
        purchaseBarcodeScanInput: document.getElementById('purchase-barcode-scan-input')
    };

    async function startApp() {
        await loadInitialData();

        initializeUIManager(uiElements);
        initializeProductManager(uiElements);
        initializeSalesManager(uiElements);
        initializeStockManager(uiElements);
        initializeDebtManager(uiElements);
        initializeReportsManager(uiElements);
        initializeButcheringManager(uiElements);
        initializeNotesManager(uiElements);
        initializeSettingsManager(uiElements);
        initializePurchaseManager(uiElements);

        uiElements.sideNavbar.addEventListener('click', (e) => { 
    // '.tab-btn' yerine yeni buton sınıfımız olan '.nav-btn'i arıyoruz
    const target = e.target.closest('.nav-btn');
    if (!target || target.classList.contains('active')) return;
    if (target.classList.contains('hidden-by-role')) return;

    const currentActiveTab = uiElements.sideNavbar.querySelector('.active'); // '.tabs' yerine '.sideNavbar'
    if (currentActiveTab) {
        const currentContent = document.getElementById(currentActiveTab.dataset.tab);
        if (currentContent) currentContent.classList.remove('active');
        currentActiveTab.classList.remove('active');
    }
    target.classList.add('active');
    const newContent = document.getElementById(target.dataset.tab);
    if (newContent) newContent.classList.add('active');
    renderAll();
});

if (uiElements.shopSelect) {
            uiElements.shopSelect.addEventListener('change', async (e) => {
                const selectedShopId = parseInt(e.target.value);
                const selectedShop = state.accessibleShops.find(shop => shop.id === selectedShopId);
                
                if (selectedShop) {
                    // 1. Aktif dükkanı state'de güncelle
                    state.currentShop = selectedShop;
                    
                    // 2. Yeni seçilen dükkana ait tüm verileri yeniden yükle
                    await loadInitialData(); 
                    
                    // 3. Tüm arayüzü yeni verilerle yeniden çiz
                    renderAll(); 
                }
            });
        }

        
        if (uiElements.subTabsContainer) {
            uiElements.subTabsContainer.addEventListener('click', (e) => {
                const target = e.target.closest('.sub-tab-btn');
                if (!target || target.classList.contains('active')) return;
                uiElements.subTabsContainer.querySelector('.active').classList.remove('active');
                target.classList.add('active');
                document.querySelectorAll('.sub-tab-content').forEach(content => content.classList.remove('active'));
                document.getElementById(target.dataset.subtab).classList.add('active');
            });
        }
        
        uiElements.exportDataBtn.addEventListener('click', exportData);
        uiElements.importDataBtn.addEventListener('click', () => uiElements.importFileInput.click());
        uiElements.importFileInput.addEventListener('change', (e) => importData(e, renderAll));
        
        renderAll();
        applyRolePermissions();
        
        if (uiElements.barcodeScanInput) {
            uiElements.barcodeScanInput.focus();
        }
    }

    initializeAuthManager(uiElements, startApp);
});