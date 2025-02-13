const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    salePrice: { type: Number, required: true },
    buyPrice: { type: Number, required: true }, // Changed from String to Number
    totalPic: { type: Number, required: true, default: 0 },
});

const shopSchema = new mongoose.Schema({
    name: { type: String, required: true },
    address: { type: String, required: true },
    owner: { type: String, required: true },
    moNumber: { type: Number, required: true },
    allProduct: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }], // Changed to array of references
    totalInvestment: { type: Number, default: 0 }, // Added default value
    date: { type: String, required: true, default: () => formatDate(new Date()) },
});

const stockSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
    quantitySale: { type: Number, required: true, default: 0 },
    quantityBuy: { type: Number, required: true, default: 0 },
    date: { type: String, required: true },
}); 

const dailySaleSchema = new mongoose.Schema({
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
    date: { type: String, required: true },
    totalSale: { type: Number, required: true, default: 0 }, // Added default value
    totalBuy: { type: Number, required: true, default: 0 }, // Added default value
    stockId: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Stock' }], // Changed to array of references
});

const todayDataSchema = new mongoose.Schema({
    shopId: { type: mongoose.Schema.Types.ObjectId, required: true },
    date: { type: String, required: true},
    totalMoney: { type: Number, required: true, default: 0 }, // Added default value
    totalPic: { type: Number, required: true, default: 0 }, // Added default value
});

// Capitalized model names
const Product = mongoose.model('Product', productSchema);
const Shop = mongoose.model('Shop', shopSchema);
const Stock = mongoose.model('Stock', stockSchema);
const DailySale = mongoose.model('DailySale', dailySaleSchema);
const TodayData = mongoose.model('TodayData', todayDataSchema);

module.exports = { Product, Shop, Stock, DailySale, TodayData };
