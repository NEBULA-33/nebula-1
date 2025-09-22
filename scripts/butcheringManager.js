import { state } from './dataManager.js';
import { renderAll } from './uiManager.js';
import { showMessage } from './utils.js';
import { logAction } from './logManager.js';
import { supabase } from './supabaseClient.js';
import { getCurrentRole } from './authManager.js';

let uiElements = {};

// Verileri (ürünler ve reçeteler) dükkana göre tazelemek için
async function refreshData() {
    const currentShopId = state.currentShop.id;
    if (!currentShopId) return;

    const { data: productsData } = await supabase.from('products').select('*').eq('shop_id', currentShopId);
    state.products = productsData || [];

    const { data: recipesData } = await supabase.from('butchering_recipes').select('*').eq('shop_id', currentShopId);
    state.butcheringRecipes = recipesData || [];
    
    renderAll();
}

function findProductByCode(code) {
    if (code.startsWith('28') && code.length >= 12) {
        const pluCode = code.substring(2, 7);
        return state.products.find(p => p.is_weighable && p.plu_codes && p.plu_codes.includes(pluCode));
    } else {
        return state.products.find(p => !p.is_weighable && p.barcode === code);
    }
}

function handleSourceProductScan(e) {
    const barcode = e.target.value.trim();
    uiElements.butcherQuantityInput.value = ''; // Önce miktar kutusunu temizle

    if (!barcode) {
        uiElements.scannedSourceProductName.textContent = '';
        uiElements.butcherRecipeSelect.innerHTML = '<option value="">-- Önce Ürün Okutun --</option>';
        uiElements.butcherRecipeSelect.disabled = true;
        return;
    }

    let product = null;
    let quantity = null;

    // Barkodu analiz et ve ürünü bul
    if (barcode.startsWith('28') && barcode.length >= 12) {
        const pluCode = barcode.substring(2, 7);
        const weightInGrams = parseInt(barcode.substring(7, 12));
        product = state.products.find(p => p.is_weighable && p.plu_codes && p.plu_codes.includes(pluCode));
        if (product && !isNaN(weightInGrams)) {
            quantity = weightInGrams / 1000.0; // Gramı kilograma çevir
        }
    } else {
        product = state.products.find(p => !p.is_weighable && p.barcode === barcode);
    }
    
    // Ürün bulunduysa işlemlere devam et
    if (product) {
        uiElements.scannedSourceProductName.textContent = `Seçilen Ürün: ${product.name}`;
        
        // YENİ: Miktar bulunduysa, ilgili input'a yaz
        if (quantity !== null) {
            uiElements.butcherQuantityInput.value = quantity.toFixed(3);
        }

        const filteredRecipes = state.butcheringRecipes.filter(r => r.source_product_id === product.id);
        
        if (filteredRecipes.length > 0) {
            const recipesOptions = filteredRecipes.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
            uiElements.butcherRecipeSelect.innerHTML = `<option value="">-- Reçete Seç --</option>${recipesOptions}`;
            uiElements.butcherRecipeSelect.disabled = false;
            showMessage(uiElements.butcherMessage, `${product.name} seçildi. Şimdi reçete seçin.`, 'success');
        } else {
            uiElements.butcherRecipeSelect.innerHTML = '<option value="">-- Reçete Bulunamadı --</option>';
            uiElements.butcherRecipeSelect.disabled = true;
            showMessage(uiElements.butcherMessage, 'Bu ürüne ait reçete bulunamadı!', 'error');
        }
    } else {
        uiElements.scannedSourceProductName.textContent = '';
        uiElements.butcherRecipeSelect.innerHTML = '<option value="">-- Önce Ürün Okutun --</option>';
        uiElements.butcherRecipeSelect.disabled = true;
        showMessage(uiElements.butcherMessage, 'Bu barkoda/PLU\'ya sahip ürün bulunamadı!', 'error');
    }
}

function addRecipeOutputLine(productId = '', percentage = '') {
    if (!uiElements.recipeOutputsContainer) return;
    
    const line = document.createElement('div');
    line.className = 'recipe-output-line';

    const productSelect = document.createElement('select');
    productSelect.className = 'recipe-output-product';
    
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '-- Çıktı Ürünü Seç --';
    productSelect.appendChild(defaultOption);

    state.products.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = p.name;
        productSelect.appendChild(option);
    });
    
    productSelect.value = productId;

    const percentageInput = document.createElement('input');
    percentageInput.type = 'number';
    percentageInput.className = 'recipe-output-percentage';
    percentageInput.placeholder = 'Oran %';
    percentageInput.step = '0.01';
    percentageInput.value = percentage;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'delete-btn';
    removeBtn.textContent = 'X';
    removeBtn.onclick = () => line.remove();

    line.append(productSelect, percentageInput, removeBtn);
    uiElements.recipeOutputsContainer.appendChild(line);
}

function resetRecipeForm() {
    if (uiElements.butcheringRecipeForm) uiElements.butcheringRecipeForm.reset();
    if (uiElements.editRecipeId) uiElements.editRecipeId.value = '';
    if (uiElements.recipeOutputsContainer) uiElements.recipeOutputsContainer.innerHTML = '';
    if (state.products.length > 0) {
        addRecipeOutputLine();
    }
    if (uiElements.saveRecipeBtn) uiElements.saveRecipeBtn.textContent = 'Reçeteyi Kaydet';
    if (uiElements.cancelRecipeEditBtn) uiElements.cancelRecipeEditBtn.style.display = 'none';
}

async function handleRecipeSave(e) {
    e.preventDefault();
    const currentShopId = state.currentShop?.id;
    if (!currentShopId) return alert("Aktif dükkan bilgisi bulunamadı!");

    const recipeId = parseInt(uiElements.editRecipeId.value) || null;
    const recipeName = uiElements.recipeName.value.trim();
    const sourceProductId = parseInt(uiElements.recipeSourceProduct.value);
    if (!recipeName || !sourceProductId) {
        return alert('Reçete adı ve kaynak ürün seçilmelidir.');
    }
    const outputs = [];
    let totalPercentage = 0;
    uiElements.recipeOutputsContainer.querySelectorAll('.recipe-output-line').forEach(line => {
        const productId = parseInt(line.querySelector('.recipe-output-product').value);
        const percentage = parseFloat(line.querySelector('.recipe-output-percentage').value);
        if (productId && percentage > 0) {
            outputs.push({ productId, percentage });
            totalPercentage += percentage;
        }
    });
    if (outputs.length === 0) {
        return alert('En az bir geçerli çıktı ürünü eklemelisiniz.');
    }
    if (totalPercentage > 100.01) {
        return alert(`Toplam oran %100'ü geçemez! Sizin toplamınız: %${totalPercentage.toFixed(2)}`);
    }

    const recipeData = { 
        name: recipeName, 
        source_product_id: sourceProductId, 
        outputs,
        shop_id: currentShopId // YENİ: Dükkan ID'sini ekle
    };
    
    if (recipeId) {
        const { error } = await supabase.from('butchering_recipes').update(recipeData).eq('id', recipeId);
        if(error) return alert(`Reçete güncellenemedi: ${error.message}`);
    } else {
        const { error } = await supabase.from('butchering_recipes').insert([recipeData]);
        if(error) return alert(`Reçete kaydedilemedi: ${error.message}`);
    }
    
    await refreshData();
    resetRecipeForm();
}

function editRecipe(id) {
    const recipe = state.butcheringRecipes.find(r => r.id === id);
    if (!recipe) return;
    resetRecipeForm();
    uiElements.editRecipeId.value = recipe.id;
    uiElements.recipeName.value = recipe.name;
    uiElements.recipeSourceProduct.value = recipe.source_product_id;
    uiElements.recipeOutputsContainer.innerHTML = '';
    recipe.outputs.forEach(output => addRecipeOutputLine(output.productId, output.percentage));
    uiElements.saveRecipeBtn.textContent = 'Reçeteyi Güncelle';
    uiElements.cancelRecipeEditBtn.style.display = 'inline-block';
}

async function deleteRecipe(id) {
    if (confirm("Bu reçeteyi silmek istediğinizden emin misiniz?")) {
        const { error } = await supabase.from('butchering_recipes').delete().eq('id', id);
        if(error) return alert(`Reçete silinemedi: ${error.message}`);
        await refreshData();
    }
}

async function executeButchering(e) {
    e.preventDefault();
    const currentShopId = state.currentShop?.id;
    const currentUserId = state.currentUser?.id;
    if (!currentShopId || !currentUserId) return alert("Aktif dükkan veya kullanıcı bilgisi bulunamadı!");

    const product = findProductByCode(uiElements.butcherSourceScanInput.value.trim());
    if (!product) {
        return showMessage(uiElements.butcherMessage, 'Lütfen önce geçerli bir ana ürün okutun.', 'error');
    }
    const recipeId = parseInt(uiElements.butcherRecipeSelect.value);
    const quantity = parseFloat(uiElements.butcherQuantityInput.value);
    if (!recipeId || !quantity || quantity <= 0) {
        return showMessage(uiElements.butcherMessage, 'Lütfen geçerli bir reçete ve miktar girin.', 'error');
    }
    const recipe = state.butcheringRecipes.find(r => r.id === recipeId);
    const sourceProductInState = state.products.find(p => p.id === product.id);
    if (sourceProductInState.stock < quantity) {
        return showMessage(uiElements.butcherMessage, `Ana ürün için yeterli stok yok! (Stok: ${sourceProductInState.stock})`, 'error');
    }
    
    // Stokları güncelleme
    const newSourceStock = sourceProductInState.stock - quantity;
    await supabase.from('products').update({ stock: newSourceStock }).eq('id', sourceProductInState.id);

    const butcheringRecordOutputs = [];
    
    for (const output of recipe.outputs) {
        const outputProduct = state.products.find(p => p.id === output.productId);
        if (outputProduct) {
            const addedQuantity = quantity * (output.percentage / 100);
            const newOutputStock = (outputProduct.stock || 0) + addedQuantity;
            await supabase.from('products').update({ stock: newOutputStock }).eq('id', outputProduct.id);
            
            butcheringRecordOutputs.push({
                productId: outputProduct.id,
                productName: outputProduct.name,
                quantity: addedQuantity,
                sellingPrice: outputProduct.selling_price,
                purchasePrice: outputProduct.purchase_price
            });
        }
    }
    
    const butcheringRecord = {
        recipe_id: recipe.id,
        recipe_name: recipe.name,
        source_product_id: product.id,
        source_product_name: product.name,
        source_quantity: quantity,
        source_product_cost: (sourceProductInState.purchase_price || 0) * quantity,
        outputs: butcheringRecordOutputs,
        shop_id: currentShopId,   // YENİ
        user_id: currentUserId    // YENİ
    };
    await supabase.from('butchering_history').insert([butcheringRecord]);
    
    await logAction('BUTCHERING', { recipeName: recipe.name, sourceProductName: product.name, quantity });

    await refreshData();
    showMessage(uiElements.butcherMessage, 'Parçalama işlemi başarıyla tamamlandı!', 'success');
    uiElements.executeButcheringForm.reset();
    uiElements.scannedSourceProductName.textContent = '';
    uiElements.butcherRecipeSelect.innerHTML = '<option value="">-- Önce Ürün Okutun --</option>';
    uiElements.butcherRecipeSelect.disabled = true;
}

export function initializeButcheringManager(elements) {
    uiElements = elements;
    window.app = window.app || {};
    window.app.editRecipe = editRecipe;
    window.app.deleteRecipe = deleteRecipe;

    if (uiElements.butcherSourceScanInput) {
        uiElements.butcherSourceScanInput.addEventListener('change', handleSourceProductScan);
    }
    
    // YENİ: Reçete seçimi değiştiğinde miktar kutusunu temizle
    if (uiElements.butcherRecipeSelect) {
        uiElements.butcherRecipeSelect.addEventListener('change', () => {
            // Eğer barkoddan gelen bir kilo yoksa miktar kutusunu boşalt
            if (!uiElements.butcherQuantityInput.value.startsWith('0.')) {
                 uiElements.butcherQuantityInput.value = '';
            }
        });
    }

    if (uiElements.addRecipeOutputBtn) {
        uiElements.addRecipeOutputBtn.addEventListener('click', () => addRecipeOutputLine());
    }
    if (uiElements.butcheringRecipeForm) {
        uiElements.butcheringRecipeForm.addEventListener('submit', handleRecipeSave);
    }
    if (uiElements.cancelRecipeEditBtn) {
        uiElements.cancelRecipeEditBtn.addEventListener('click', resetRecipeForm);
    }
    if (uiElements.executeButcheringForm) {
        uiElements.executeButcheringForm.addEventListener('submit', executeButchering);
    }
      const role = getCurrentRole();
    if (role !== 'manager' && role !== 'yönetici') {
        const recipeFormColumn = uiElements.butcheringRecipeForm.closest('.column');
        if (recipeFormColumn) {
            recipeFormColumn.style.display = 'none';
        }
    }

    resetRecipeForm();
}