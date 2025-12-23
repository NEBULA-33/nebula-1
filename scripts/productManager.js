import { state } from './dataManager.js';
import { renderAll } from './uiManager.js';
import { getCurrentRole } from './authManager.js';
import { logAction } from './logManager.js';
import { supabase } from './supabaseClient.js';


let uiElements = {};

// Veri değişikliğinden sonra arayüzü yenilemek için yardımcı fonksiyon
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

    const fieldsToToggle = [
        uiElements.purchasePriceInput,
        uiElements.sellingPriceInput,
        uiElements.stockQuantityInput
    ];
    fieldsToToggle.forEach(field => {
        if(field) {
            field.readOnly = false;
            field.disabled = false;
        }
    });

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
// Eski 'addPluInput' fonksiyonunu SİL, bunu YAPIŞTIR:
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

    // --- OTOMATİK TEMİZLEME KODU ---
    const inputField = group.querySelector('.plu-code-input');
    inputField.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        // Barkod 27, 28 veya 29 ile başlıyorsa ve 12 karakterden uzunsa içindeki 5 haneyi (PLU) al
        if (val.length >= 12 && (val.startsWith('27') || val.startsWith('28') || val.startsWith('29'))) {
            e.target.value = val.substring(2, 7); 
            // Görsel efekt
            e.target.style.backgroundColor = '#e7f3ff';
            setTimeout(() => e.target.style.backgroundColor = '', 500);
        }
    });
    // -------------------------------

    group.querySelector('.delete-btn').onclick = () => group.remove();
    uiElements.pluCodesContainer.appendChild(group);
}

// Eski 'handleProductFormSubmit' fonksiyonunu SİL, bunu YAPIŞTIR:
async function handleProductFormSubmit(e) {
    e.preventDefault();
    
    const currentShopId = state.currentShop?.id;
    if (!currentShopId) return alert("Aktif dükkan seçilemedi!");

    const editingId = uiElements.editProductIdInput.value ? parseInt(uiElements.editProductIdInput.value) : null;
    const productName = uiElements.productNameInput.value.trim();
    const sellingPrice = parseFloat(uiElements.sellingPriceInput.value);
    const stockToAdd = parseFloat(uiElements.stockQuantityInput.value) || 0;

    // --- PLU KODLARINI ALMA KISMI (DÜZELTİLDİ) ---
    const pluCodes = [];
    if (uiElements.pluCodesContainer) {
        uiElements.pluCodesContainer.querySelectorAll('.plu-input-group').forEach(group => {
            const pluInput = group.querySelector('.plu-code-input');
            const multiplierInput = group.querySelector('.plu-multiplier-input');
            
            const plu = pluInput ? pluInput.value.trim() : '';
            const multiplierVal = multiplierInput ? multiplierInput.value : '';
            
            // Çarpan boş olsa bile kaydetmesini sağlıyoruz
            if (plu) {
                if (multiplierVal && parseFloat(multiplierVal) > 0) {
                    pluCodes.push({ plu: plu, multiplier: parseFloat(multiplierVal) });
                } else {
                    pluCodes.push({ plu: plu }); 
                }
            }
        });
    }
    // ---------------------------------------------

    // Paketleme seçenekleri
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
        // Düzenlerken stoğu elleme (isteğe bağlı stockToAdd eklenebilir)
        const { error: updateError } = await supabase.from('products').update(productData).eq('id', editingId);
        error = updateError;
    } else {
        productData.stock = stockToAdd;
        const { error: insertError } = await supabase.from('products').insert([productData]);
        error = insertError;
    }

    if (error) {
        alert(`Hata: ${error.message}`);
    } else {
        await refreshProducts();
        resetProductForm();
        alert("Ürün kaydedildi.");
    }
}
// productManager.js dosyasında, addPluInput fonksiyonundan sonra EKLE

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

// "Aynı ürün varsa stoğu güncelle" mantığı eklenmiş tam fonksiyon
async function handleProductFormSubmit(e) {
    e.preventDefault();
    
    const currentShopId = state.currentShop?.id;
    if (!currentShopId) return alert("Aktif dükkan seçilemedi! Lütfen tekrar giriş yapın.");

    const editingId = uiElements.editProductIdInput.value ? parseInt(uiElements.editProductIdInput.value) : null;
    
    const productName = uiElements.productNameInput.value.trim();
    const sellingPrice = parseFloat(uiElements.sellingPriceInput.value);
    const stockToAdd = parseFloat(uiElements.stockQuantityInput.value) || 0;

    // Eğer DÜZENLEME MODUNDA DEĞİLSEK, aynı isim ve fiyatta ürün var mı diye kontrol et
    if (!editingId && productName && !isNaN(sellingPrice)) {
        const { data: existingProduct, error: findError } = await supabase
            .from('products')
            .select('*')
            .eq('shop_id', currentShopId)
            .eq('name', productName)
            .eq('selling_price', sellingPrice)
            .single();

        if (findError && findError.code !== 'PGRST116') { // PGRST116 "hiç satır bulunamadı" hatasıdır, bu bizim için bir hata değil.
            return alert(`Ürün kontrol edilirken hata: ${findError.message}`);
        }

        // Eğer ürün bulunduysa, stoğunu güncelle ve işlemi bitir
        if (existingProduct) {
            const newStock = (existingProduct.stock || 0) + stockToAdd;
            const { error: updateError } = await supabase
                .from('products')
                .update({ stock: newStock, purchase_price: parseFloat(uiElements.purchasePriceInput.value) }) // Alış fiyatını da güncelleyelim
                .eq('id', existingProduct.id);

            if (updateError) {
                return alert(`Stok güncellenirken hata: ${updateError.message}`);
            }

            await logAction('PRODUCT_STOCK_ADD', { productName: productName, addedStock: stockToAdd });
            await refreshProducts();
            resetProductForm();
            return; // Fonksiyonu burada sonlandırıyoruz.
        }
    }

    // --- Eğer ürün bulunamadıysa VEYA DÜZENLEME MODUNDAYSAK, normal ekleme/güncelleme işlemi devam eder ---
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
    
const pluCodes = [];
uiElements.pluCodesContainer.querySelectorAll('.plu-input-group').forEach(group => {
    const plu = group.querySelector('.plu-code-input').value.trim();
    const multiplier = parseFloat(group.querySelector('.plu-multiplier-input').value);
    if (plu && multiplier > 0) {
        pluCodes.push({ plu, multiplier });
    }
});
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
        // Düzenleme modunda stock'u üzerine ekleme, direkt yeni değeri ata
        productData.stock = stockToAdd;
        const { error: updateError } = await supabase.from('products').update(productData).eq('id', editingId);
        error = updateError;
        if (!error) await logAction('PRODUCT_UPDATE', { productId: editingId, productName: productData.name });
    } else {
        // Yeni ürün eklenirken stok doğrudan atanır
        productData.stock = stockToAdd;
        const { error: insertError } = await supabase.from('products').insert([productData]);
        error = insertError;
        if (!error) await logAction('PRODUCT_CREATE', { productName: productData.name });
    }

    if (error) {
        console.error('Ürün işlemi başarısız:', error);
        alert(`Hata: ${error.message}`);
    } else {
        await refreshProducts();
        resetProductForm();
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
    product.plu_codes.forEach(codeObj => addPluInput(codeObj.plu, codeObj.multiplier));
}
    
    toggleProductFields();
    if (!uiElements.packagingOptionsContainer) {
    uiElements.packagingOptionsContainer = document.getElementById('packaging-options-container');
}
// Önceki koli girdilerini temizle
uiElements.packagingOptionsContainer.innerHTML = ''; 
// Kayıtlı koli seçeneklerini forma ekle
if (product.packaging_options) {
    product.packaging_options.forEach(opt => addPackagingInput(opt.barcode, opt.quantity));
}

  const role = getCurrentRole();
    const isManager = (role === 'manager' || role === 'yönetici'); // Rol adını kontrol edelim
    
    // YÖNETİCİ DEĞİLSE, SADECE YÖNETİCİYE ÖZEL ALANLARI KİLİTLE
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
    if (confirm(`'${productName}' adlı ürünü ve tüm geçmişini (satışlar, stok hareketleri vb.) kalıcı olarak silmek istediğinizden emin misiniz?`)) {
        const { error } = await supabase
            .from('products')
            .delete()
            .eq('id', id)
            .eq('shop_id', currentShopId);

        if (error) {
            console.error('Ürün silinemedi:', error);
            alert(`Hata: ${error.message}`);
        } else {
            await logAction('PRODUCT_DELETE', { productId: id, productName: productName });
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