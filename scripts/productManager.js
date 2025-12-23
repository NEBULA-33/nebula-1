import { state } from './dataManager.js';
import { renderAll } from './uiManager.js';
import { getCurrentRole } from './authManager.js';
import { logAction } from './logManager.js';
import { supabase } from './supabaseClient.js';

let uiElements = {};

// Arayüzü yenileme
async function refreshProducts() {
    const currentShopId = state.currentShop?.id;
    if (!currentShopId) return;
    const { data, error } = await supabase.from('products').select('*').eq('shop_id', currentShopId);
    if (error) {
        console.error('Ürünler yenilenemedi:', error);
    } else {
        state.products = data || [];
        renderAll();
    }
}

function resetProductForm() {
    if (uiElements.productForm) uiElements.productForm.reset();
    if (uiElements.editProductIdInput) uiElements.editProductIdInput.value = '';
    if (uiElements.pluCodesContainer) uiElements.pluCodesContainer.innerHTML = '';
    if (uiElements.productSubmitBtn) uiElements.productSubmitBtn.textContent = 'Ürünü Ekle';
    if (uiElements.cancelEditBtn) uiElements.cancelEditBtn.style.display = 'none';
    if (document.getElementById('packaging-options-container')) {
        document.getElementById('packaging-options-container').innerHTML = '';
    }
    
    // Düzenleme sonrası kilitli alanları aç
    if(uiElements.purchasePriceInput) uiElements.purchasePriceInput.disabled = false;
    if(uiElements.sellingPriceInput) uiElements.sellingPriceInput.disabled = false;
    if(uiElements.stockQuantityInput) uiElements.stockQuantityInput.disabled = false;

    toggleProductFields();
}

function toggleProductFields() {
    if (!uiElements.isWeighableCheckbox || !uiElements.pluSection || !uiElements.barcodeSection) return;
    if (uiElements.isWeighableCheckbox.checked) {
        uiElements.pluSection.style.display = 'block';
        uiElements.barcodeSection.style.display = 'none';
        if (uiElements.pluCodesContainer && uiElements.pluCodesContainer.children.length === 0) {
            addPluInput();
        }
    } else {
        uiElements.pluSection.style.display = 'none';
        uiElements.barcodeSection.style.display = 'block';
    }
}

// --- BARKOD EKLEME KUTUSU (DÜZELTİLDİ: Enter ile kırpar) ---
function addPluInput(plu = '', multiplier = '') {
    if (!uiElements.pluCodesContainer) return;
    
    const group = document.createElement('div');
    group.className = 'form-row plu-input-group';
    group.innerHTML = `
        <div class="form-group" style="flex: 2;">
            <input type="text" class="plu-code-input" placeholder="Barkodu okutun..." value="${plu}">
        </div>
        <div class="form-group" style="flex: 1;">
            <input type="number" class="plu-multiplier-input" placeholder="Çarpan (İsteğe Bağlı)" value="${multiplier}" step="0.001">
        </div>
        <button type="button" class="delete-btn">Sil</button>
    `;

    const inputField = group.querySelector('.plu-code-input');
    
    // YAZARKEN DEĞİL, ENTER'A BASINCA VEYA KUTUDAN ÇIKINCA KIRPAR
    inputField.addEventListener('change', (e) => {
        const val = e.target.value.trim();
        // Terazi barkodu (27-29 ile başlar, 12+ hane) ise kırp
        if (val.length >= 12 && (val.startsWith('27') || val.startsWith('28') || val.startsWith('29'))) {
            e.target.value = val.substring(2, 7); 
            e.target.style.backgroundColor = '#e7f3ff';
            setTimeout(() => e.target.style.backgroundColor = '', 500);
        }
    });

    group.querySelector('.delete-btn').onclick = () => group.remove();
    uiElements.pluCodesContainer.appendChild(group);
}

function addPackagingInput(barcode = '', quantity = '') {
    if (!uiElements.packagingOptionsContainer) {
        uiElements.packagingOptionsContainer = document.getElementById('packaging-options-container');
    }
    const group = document.createElement('div');
    group.className = 'form-row packaging-input-group';
    group.innerHTML = `
        <div class="form-group" style="flex: 2;">
            <input type="text" class="packaging-barcode-input" placeholder="Koli Barkodu" value="${barcode}">
        </div>
        <div class="form-group" style="flex: 1;">
            <input type="number" class="packaging-quantity-input" placeholder="Miktar" value="${quantity}">
        </div>
        <button type="button" class="delete-btn">Sil</button>
    `;
    group.querySelector('.delete-btn').onclick = () => group.remove();
    uiElements.packagingOptionsContainer.appendChild(group);
}

// --- ANA KAYDETME FONKSİYONU (DÜZELTİLDİ: Tek ve Sorunsuz) ---
async function handleProductFormSubmit(e) {
    e.preventDefault();
    
    const currentShopId = state.currentShop?.id;
    if (!currentShopId) return alert("Aktif dükkan seçilemedi!");

    const editingId = uiElements.editProductIdInput.value ? parseInt(uiElements.editProductIdInput.value) : null;
    const productName = uiElements.productNameInput.value.trim();
    const sellingPrice = parseFloat(uiElements.sellingPriceInput.value);
    const stockToAdd = parseFloat(uiElements.stockQuantityInput.value) || 0;

    // 1. AYNI ÜRÜN VAR MI KONTROLÜ (Stok Ekleme Modu)
    if (!editingId && productName && !isNaN(sellingPrice)) {
        const { data: existingProduct, error: findError } = await supabase
            .from('products')
            .select('*')
            .eq('shop_id', currentShopId)
            .eq('name', productName)
            .eq('selling_price', sellingPrice)
            .single();

        if (existingProduct) {
            const newStock = (existingProduct.stock || 0) + stockToAdd;
            const { error: updateError } = await supabase
                .from('products')
                .update({ stock: newStock }) 
                .eq('id', existingProduct.id);

            if (updateError) return alert(`Hata: ${updateError.message}`);
            
            if(typeof logAction === 'function') await logAction('PRODUCT_STOCK_ADD', { productName: productName, addedStock: stockToAdd });
            await refreshProducts();
            resetProductForm();
            alert(`"${productName}" zaten vardı, stoğu güncellendi.`);
            return; 
        }
    }

    // 2. PLU KODLARINI TOPLAMA (HATA BURADAYDI, DÜZELTİLDİ)
    const pluCodes = [];
    if (uiElements.pluCodesContainer) {
        uiElements.pluCodesContainer.querySelectorAll('.plu-input-group').forEach(group => {
            const pluInput = group.querySelector('.plu-code-input');
            const multiplierInput = group.querySelector('.plu-multiplier-input');
            
            const plu = pluInput ? pluInput.value.trim() : '';
            const multiplierVal = multiplierInput ? multiplierInput.value : '';
            
            // Çarpan boş olsa BİLE kaydet
            if (plu) {
                if (multiplierVal && parseFloat(multiplierVal) > 0) {
                    pluCodes.push({ plu: plu, multiplier: parseFloat(multiplierVal) });
                } else {
                    pluCodes.push({ plu: plu }); 
                }
            }
        });
    }

    // Paketleme Seçenekleri
    const packagingOptions = [];
    if (document.getElementById('packaging-options-container')) {
        document.querySelectorAll('.packaging-input-group').forEach(group => {
            const barcode = group.querySelector('.packaging-barcode-input').value.trim();
            const quantity = parseInt(group.querySelector('.packaging-quantity-input').value);
            if (barcode && quantity > 0) {
                packagingOptions.push({ barcode, quantity });
            }
        });
    }

    const productData = {
        name: productName,
        selling_price: sellingPrice,
        category: uiElements.productCategoryInput.value.trim(),
        is_weighable: uiElements.isWeighableCheckbox.checked,
        show_in_quick_add: uiElements.showInQuickAddCheckbox.checked,
        plu_codes: pluCodes, 
        barcode: uiElements.productBarcodeInput.value.trim(),
        vat_rate: parseFloat(uiElements.productVatRateSelect.value),
        packaging_options: packagingOptions,
        purchase_price: parseFloat(uiElements.purchasePriceInput.value),
        shop_id: currentShopId
    };

    let error;
    if (editingId) {
        productData.stock = stockToAdd;
        const { error: updateError } = await supabase.from('products').update(productData).eq('id', editingId);
        error = updateError;
        if (!error && typeof logAction === 'function') await logAction('PRODUCT_UPDATE', { productId: editingId, productName: productData.name });
    } else {
        productData.stock = stockToAdd;
        const { error: insertError } = await supabase.from('products').insert([productData]);
        error = insertError;
        if (!error && typeof logAction === 'function') await logAction('PRODUCT_CREATE', { productName: productData.name });
    }

    if (error) {
        alert(`Hata: ${error.message}`);
    } else {
        await refreshProducts();
        resetProductForm();
        alert("Ürün başarıyla kaydedildi.");
    }
}

function editProduct(id) {
    const product = state.products.find(p => p.id === id);
    if (!product) return;
    
    resetProductForm();
    
    uiElements.editProductIdInput.value = product.id;
    uiElements.productNameInput.value = product.name;
    uiElements.productCategoryInput.value = product.category || '';
    uiElements.isWeighableCheckbox.checked = product.is_weighable;
    uiElements.showInQuickAddCheckbox.checked = product.show_in_quick_add || false;
    uiElements.productBarcodeInput.value = product.barcode || '';
    uiElements.productVatRateSelect.value = product.vat_rate;
    uiElements.purchasePriceInput.value = product.purchase_price;
    uiElements.sellingPriceInput.value = product.selling_price;
    uiElements.stockQuantityInput.value = product.stock;
    
    if (product.is_weighable && product.plu_codes) {
        // Eski kayıtlar string olabilir, yeni kayıtlar obje. İkisini de destekle.
        product.plu_codes.forEach(codeObj => {
            if (typeof codeObj === 'object') {
                addPluInput(codeObj.plu, codeObj.multiplier);
            } else {
                addPluInput(codeObj);
            }
        });
    }
    
    toggleProductFields();
    
    if (!uiElements.packagingOptionsContainer) {
        uiElements.packagingOptionsContainer = document.getElementById('packaging-options-container');
    }
    uiElements.packagingOptionsContainer.innerHTML = ''; 
    if (product.packaging_options) {
        product.packaging_options.forEach(opt => addPackagingInput(opt.barcode, opt.quantity));
    }

    const role = getCurrentRole();
    const isManager = (role === 'manager' || role === 'yönetici');
    
    uiElements.purchasePriceInput.disabled = !isManager;
    uiElements.sellingPriceInput.disabled = !isManager; 
    uiElements.stockQuantityInput.disabled = !isManager;
    
    uiElements.productSubmitBtn.textContent = 'Ürünü Güncelle';
    uiElements.cancelEditBtn.style.display = 'inline-block';
    if (uiElements.productForm) uiElements.productForm.scrollIntoView({ behavior: 'smooth' });
}

async function deleteProduct(id) {
    const currentShopId = state.currentShop?.id;
    const productName = state.products.find(p => p.id === id)?.name || 'Bu ürün';
    if (confirm(`'${productName}' adlı ürünü silmek istediğinizden emin misiniz?`)) {
        const { error } = await supabase.from('products').delete().eq('id', id).eq('shop_id', currentShopId);
        if (error) {
            alert(`Hata: ${error.message}`);
        } else {
            if(typeof logAction === 'function') await logAction('PRODUCT_DELETE', { productId: id, productName: productName });
            await refreshProducts();
        }
    }
}

export function initializeProductManager(elements) {
    uiElements = elements;
    window.app = window.app || {};
    window.app.editProduct = editProduct;
    window.app.deleteProduct = deleteProduct;
    
    uiElements.addPackagingBtn = document.getElementById('add-packaging-btn');
    uiElements.packagingOptionsContainer = document.getElementById('packaging-options-container');
    if (uiElements.addPackagingBtn) {
        uiElements.addPackagingBtn.addEventListener('click', () => addPackagingInput());
    }
    if (uiElements.productForm) uiElements.productForm.addEventListener('submit', handleProductFormSubmit);
    if (uiElements.isWeighableCheckbox) uiElements.isWeighableCheckbox.addEventListener('change', toggleProductFields);
    if (uiElements.addPluBtn) uiElements.addPluBtn.addEventListener('click', () => addPluInput());
    if (uiElements.cancelEditBtn) uiElements.cancelEditBtn.addEventListener('click', resetProductForm);
    toggleProductFields();
}