const express = require('express');
const staticRoutes = express.Router();
const { Product, Shop, Stock, DailySale, TodayData } = require('./model.js');
const axios = require('axios');
const mongoose = require('mongoose');
const cron = require('node-cron');



function formatDate(date) {
    !date ? date = new Date() : date = date;
    const d = new Date(date);  // Convert input date to a Date object
    const day = d.getDate().toString().padStart(2, '0'); // Add leading zero for single-digit days
    const month = (d.getMonth() + 1).toString().padStart(2, '0'); // Add leading zero for single-digit months
    const year = d.getFullYear(); // Get full year

    return `${day}-${month}-${year}`;  // Return the date in dd-mm-yyyy format
}

async function addOrUpdateSales(shopId, totalSale, totalBuy, date) {
    try {
        // Find an existing sales record for the same shop and date
        const existingSale = await DailySale.findOne({ shopId: shopId, date: formatDate(date) });

        if (existingSale) {

            // If a record exists, delete the old one
            const deletedSaleRecord = await DailySale.deleteOne({ _id: existingSale._id });
        }

        const existingStock = await Stock.find({ shopId: shopId, date: formatDate(date) });

        if (existingStock.length > 0) { // Check if any records exist

            // Delete old stock records
            await Stock.deleteMany({ shopId: shopId, date: formatDate(date) });

        }

        // Find stock entries for the given shopId
        const stockEntries = await Stock.find({ shopId: shopId });

        if (stockEntries.length === 0) {
            console.log('No stock entries found for this shop.');
            return;
        }

    } catch (error) {
        console.error('Error adding or updating sales:', error);
    }
}

function toTimestamp(dateStr) {
    // Split the date string into day, month, and year
    const [day, month, year] = dateStr.split('-');

    // Create a new Date object (months are 0-based, so subtract 1 from the month)
    const dateObj = new Date(year, month - 1, day);

    // Return the timestamp (milliseconds since Unix Epoch)
    return dateObj.getTime();
}

async function saveTodayData(date) {
    try {
        const today = formatDate(date || new Date()); // Format date to dd-mm-yyyy
        const shops = await Shop.find(); // Get all shops

        for (const shop of shops) {
            // Fetch today's sales data for this shop
            const salesData = await DailySale.find({ shopId: shop._id, date: today });

            // Calculate total sale and buy amount
            const totalSale = salesData.reduce((sum, sale) => sum + (sale.totalSale || 0), 0);
            const totalBuy = salesData.reduce((sum, sale) => sum + (sale.totalBuy || 0), 0);

            // Get yesterday’s total money
            let previousTotalMoney = 0; // Default if no data is found

            for (let i = 1; i <= 7; i++) {
                const pastDate = formatDate(new Date(new Date(today.split('-').reverse().join('-')).getTime() - (i * 86400000)));
                const pastData = await TodayData.findOne({ shopId: shop._id, date: pastDate });

                if (pastData) {
                    previousTotalMoney = pastData.totalMoney; // Found data, update value
                    break; // Stop loop once valid data is found
                }
            }

            const totalMoney = previousTotalMoney + totalSale - totalBuy;

            let previousTotalPic = 0;
            for (let i = 1; i <= 7; i++) {
                const pastDate = formatDate(new Date(new Date(today.split('-').reverse().join('-')).getTime() - (i * 86400000)));
                const pastData = await TodayData.findOne({ shopId: shop._id, date: pastDate });

                if (pastData) {
                    previousTotalPic = Number(pastData.totalPic);
                    break;
                }
            }


            const stockData = await Stock.find({ shopId: shop._id, date: today });
            let totalPicStock = 0;
            stockData.forEach(element => {
                totalPicStock += Number(element.quantityBuy) - Number(element.quantitySale);
            });

            const totalPic = previousTotalPic + totalPicStock;

            // Update or insert today's data
            await TodayData.findOneAndUpdate(
                { shopId: shop._id, date: today },
                { $set: { totalMoney: totalMoney || 0, totalPic: totalPic || 0 } },
                { upsert: true, new: true }
            );
        }
    } catch (error) {
        console.error('❌ Error saving today’s data:', error);
    }
}




// Helper function to get today's date
const getTodayDate = () => {
    return new Date().toISOString().split("T")[0]; // Format as YYYY-MM-DD
};

// Helper function to get a past date
const getPastDate = (daysAgo) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().split("T")[0];
};

// Function to check last 5 days and add today's entry if missing
const checkAndAddMissingSalesReports = async () => {
    try {
        const shops = await Shop.find({}); // Fetch all shops

        for (const shop of shops) {
            let dataFound = false;

            // Check stock entries for the last 5 days
            for (let i = 1; i <= 5; i++) {
                const date = getPastDate(i);
                const existingStock = await Stock.findOne({ shopId: shop._id, date: date });

                if (existingStock) {
                    dataFound = true;
                    break; // ✅ If data is found, stop checking and move to the next shop
                }
            }

            // If no data was found in the last 5 days, create an entry for today
            if (!dataFound) {
                const today = getTodayDate();

                await axios.post(`${process.env.API_BASE_URL}/add-sales-report`, {
                    shopId: shop._id,
                    date: today,
                    quantityBuy: 0,
                    quantitySale: 0,
                    totalInvestment: 0
                });

            }
        }
    } catch (error) {
        console.error("Error checking and adding sales reports:", error);
    }
};

// Call the function at server startup
//checkAndAddMissingSalesReports();

cron.schedule('55 23 * * *', () => {
    console.log('⏳ Running stock check and update at 11:55 PM...');
    checkAndAddMissingSalesReports();
}, {
    timezone: "Asia/Kolkata" // Set to Indian Standard Time (IST)
});








// staticRoutes.get('/', (req, res) => {
//     res.render('home', { activePage: 'home' });
// });


// Route to fetch daily sales data
staticRoutes.get('/', async (req, res) => {
    try {
        // Get selected date or default to yesterday
        let selectedDate = req.query.date || new Date();
        if (!req.query.date) {
            let yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            selectedDate = yesterday.toISOString().split('T')[0]; // Format YYYY-MM-DD
            // selectedDate = formatDate(selectedDate); // Format to DD-MM-YYYY
        }

        // Convert date format to match database format (if necessary)
        const formattedDate = formatDate(new Date(selectedDate)); // "DD-MM-YYYY"
        // Fetch all shops
        const shops = await Shop.find();

        let salesData = [];
        0
        // Loop through each shop to calculate totals
        for (const shop of shops) {
            const stockEntries = await Stock.find({ shopId: shop._id, date: formattedDate });

            let totalSalesPic = 0;
            let totalBuyPic = 0;
            let totalSalesMoney = 0;
            let totalSpendMoney = 0;

            const todaySales = await DailySale.findOne({ shopId: shop._id, date: formattedDate });
            totalSalesMoney = Number(todaySales.totalSale);
            totalSpendMoney = Number(todaySales.totalBuy);

            // Calculate totals from stock entries
            for (const stock of stockEntries) {
                totalSalesPic = totalSalesPic + stock.quantitySale;
                totalBuyPic = totalBuyPic + stock.quantityBuy;
            }

            // Push data for each shop
            salesData.push({
                shopName: shop.name,
                totalSalesMoney,
                totalSpendMoney,
                totalSalesPic,
                totalBuyPic,
            });
        }

        res.render('home', { salesData, selectedDate });

    } catch (error) {
        console.error("Error fetching sales data:", error);
        res.render('home', { salesData: [], selectedDate: req.query.date || '' });
    }
});































staticRoutes.get('/add-sales-report', async (req, res) => {
    try {
        const shops = await Shop.find(); // Fetch all shops
        const products = await Product.find(); // Fetch all products
        res.render('add-sales-report', { shops, products }); // Pass data to EJS
    } catch (err) {
        console.error(err);
        res.status(500).send('❌ Error fetching data');
    }
});

staticRoutes.post('/add-sales-report', async (req, res) => {
    const { shopId, date, totalMoneyCollection, totalMoneySpent, buy, sale } = req.body;

    if (!shopId || !date || !totalMoneyCollection || !totalMoneySpent) {
        return res.status(400).json({ message: "All fields are required" });
    }

    const existingStock = await Stock.find({ shopId: shopId, date: formatDate(date) });
    let oldSalePics = {}; // Object to store oldSalePic per product
    let oldTotalInvestment = 0;

    existingStock.forEach(stock => {
        const quantityBuy = Number(stock.quantityBuy) || 0;
        const quantitySale = Number(stock.quantitySale) || 0;
        const buyPrice = Number(stock.buyPrice) || 0;
        const salePrice = Number(stock.salePrice) || 0;

        // Validate the values before using them
        if (isNaN(quantityBuy) || isNaN(quantitySale) || isNaN(buyPrice) || isNaN(salePrice)) {
            console.error("Invalid data found in stock", stock);
        }

        // Calculate oldSalePic for each product (productId is used as the key)
        const productId = stock.productId.toString(); // Ensure it's in string format for use as a key
        if (!oldSalePics[productId]) {
            oldSalePics[productId] = 0; // Initialize if not yet created
        }

        oldSalePics[productId] += (quantityBuy - quantitySale); // Accumulate for each product

        // Calculate oldTotalInvestment
        oldTotalInvestment += (quantityBuy * buyPrice) - (quantitySale * buyPrice);
    });

    // After you have the oldSalePics object, you can connect it with the products like this:
    for (const productId in oldSalePics) {
        const oldSalePic = oldSalePics[productId];
        const product = await Product.findById(productId); // Fetch product by its ID

        if (product) {
            // Subtract oldSalePic from the current product totalPic (or whatever field you're working with)
            product.totalPic = Math.max(0, (Number(product.totalPic) || 0) - oldSalePic);
            await product.save(); // Save the updated product
        }
    }


    await addOrUpdateSales(shopId, totalMoneyCollection, totalMoneySpent, date);

    try {
        const shop = await Shop.findById(shopId);
        if (!shop) {
            return res.status(404).json({ message: "Shop not found" });
        }

        const stockEntries = [];
        const products = await Product.find({ '_id': { $in: Object.keys(buy) } });
        let todayInvestment = 0

        await Promise.all(products.map(async (product) => {
            const buyQuantity = parseInt(buy[product._id]) || 0;
            const saleQuantity = parseInt(sale[product._id]) || 0;

            // Fetch the oldSalePic for the specific product from the existingStock
            const productId = product._id.toString(); // Ensure it's in string format
            const oldSalePic = oldSalePics[productId] || 0; // Get the oldSalePic for the specific product (default to 0 if not found)

            // Calculate the new totalPic
            const newTotalPic = Math.max(0, Number(product.totalPic) + buyQuantity - saleQuantity);

            // Use findOneAndUpdate to update the product's totalPic
            await Product.findOneAndUpdate(
                { _id: product._id }, // Find product by its _id
                { $set: { totalPic: newTotalPic } }, // Update totalPic
                { new: true } // Optionally return the updated document
            );

            // Create Stock Entry for each product
            const stock = new Stock({
                productId: product._id,
                shopId: shop._id,
                quantityBuy: buyQuantity,
                quantitySale: saleQuantity,
                date: formatDate(date),
            });
            await stock.save();
            stockEntries.push(stock._id);

            // Update shop's total Investment for each product
            todayInvestment = Number(buyQuantity - saleQuantity) * Number(product.buyPrice) + todayInvestment;

            let previousTotalInvestment = 0; // Default value if no data found
            for (let i = 1; i <= 7; i++) {
                const pastDate = formatDate(new Date(new Date(date.split('-').reverse().join('-')).getTime() - (i * 86400000)));
                const pastData = await Shop.findOne({ _id: shop._id, date: pastDate });

                if (pastData) {
                    previousTotalInvestment = pastData.totalInvestment; // Found data, update value
                    break; // Stop loop once valid data is found
                }
            }
            const totalInvestment = (previousTotalInvestment || 0) + (todayInvestment || 0);

            shop.totalInvestment = totalInvestment; // Update shop's totalInvestment
            shop.date = formatDate(date); // Update shop's date
        }));

        // Await the shop save operation after all products are processed
        await shop.save();

        if (stockEntries.length === 0) {
            console.error("No stock entries were created.");
            return res.status(400).json({ message: "No stock entries were created." });
        }

        const dailySale = new DailySale({
            shopId,
            date: formatDate(date),
            totalSale: totalMoneyCollection,
            totalBuy: totalMoneySpent,
            stockId: stockEntries,
        });

        await dailySale.save();
        saveTodayData(date);

        req.flash('message', 'Sales report added successfully!');
        res.redirect('/');
        //res.redirect('/sales-report-success');
    } catch (error) {
        console.error("Error submitting sales report:", error);
        // res.status(500).json({ message: "Error submitting sales report" });
        req.flash('message', 'Error adding sales report!');
        res.redirect('/');
    }
});





// Fetch product report for the stock
staticRoutes.get('/product-stock-report', async (req, res) => {
    try {
        const stocks = await Stock.find().populate('productId').populate('shopId'); // Get all stock entries and populate product and shop info
        res.render('product-stock-report', { stocks });
    } catch (error) {
        console.error("Error fetching stock report:", error);
        res.status(500).send("Error fetching stock report");
    }
});

staticRoutes.get('/products', (req, res) => {
    res.redirect('/add-product');
});










staticRoutes.get('/add-shop', async (req, res) => {
    try {
        const products = await Product.find(); // Fetch all products
        res.render('add-shop', { products });
    } catch (err) {
        res.status(500).send('❌ Error fetching products');
    }
});

// Handle Shop Submission
staticRoutes.post('/add-shop', async (req, res) => {
    try {
        const { shopName, ownerName, Address, mobileNumber, selectedProducts } = req.body;

        const newShop = new Shop({
            name: shopName,
            owner: ownerName,
            address: Address,
            moNumber: mobileNumber,
            allProduct: selectedProducts || [], // Ensure it's an array even if empty
            totalInvestment: 0, // Initialize totalInvestment to 0
            date: formatDate(new Date()), // Set the date to the current date
        });

        await newShop.save();
        res.redirect('/shops'); // Redirect to the shop list page
    } catch (err) {
        res.status(500).send('❌ Error adding shop');
    }
});











staticRoutes.get('/get-products/:shopId', async (req, res) => {
    try {
        const shop = await Shop.findById(req.params.shopId).populate('allProduct');
        if (!shop) return res.status(404).json({ message: "Shop not found" });

        res.json(shop.allProduct);
    } catch (err) {
        res.status(500).json({ message: "Error fetching products" });
    }
});





staticRoutes.get('/shops', async (req, res) => {
    try {
        const shops = await Shop.find().populate('allProduct'); // Fetch all shops with product details
        res.render('shops', { shops }); // Render shops.ejs and pass the shops data
    } catch (err) {
        res.status(500).send('❌ Error fetching shops');
    }
});











// Show Edit Shop Page
staticRoutes.get('/edit-shop/:id', async (req, res) => {
    try {
        const shop = await Shop.findById(req.params.id).populate('allProduct');
        const products = await Product.find(); // Fetch all products for selection
        res.render('edit-shop', { shop, products });
    } catch (err) {
        res.status(500).send('❌ Error fetching shop details');
    }
});

// Handle Shop Edit
staticRoutes.post('/edit-shop/:id', async (req, res) => {
    try {
        const { shopName, ownerName, Address, mobileNumber, selectedProducts } = req.body;

        await Shop.findByIdAndUpdate(req.params.id, {
            name: shopName,
            owner: ownerName,
            address: Address,
            moNumber: mobileNumber,
            allProduct: selectedProducts || []
        });

        res.redirect('/shops');
    } catch (err) {
        res.status(500).send('❌ Error updating shop');
    }
});

// Delete Shop
staticRoutes.post('/delete-shop/:id', async (req, res) => {
    try {
        await Shop.findByIdAndDelete(req.params.id);
        res.redirect('/shops');
    } catch (err) {
        res.status(500).send('❌ Error deleting shop');
    }
});



















staticRoutes.get('/add-product', (req, res) => {
    res.render('add-product');
});

staticRoutes.post('/add-product', async (req, res) => {
    try {
        const { name, salePrice, buyPrice } = req.body;

        const newProduct = new Product({
            name,
            salePrice,
            buyPrice,
            totelPic: 0, // Initialize total pieces to 0
        });

        await newProduct.save();
        res.redirect('/products'); // Redirect to product list (create a /products route later)
    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).send('Error adding product');
    }
});












staticRoutes.get("/shop-report", (req, res) => {
    res.render("shop-report");
});

// API to get shop details
staticRoutes.get("/shop-details", async (req, res) => {
    try {
        const shops = await Shop.find().populate("allProduct");
        res.json(shops);
    } catch (error) {
        console.error("Error fetching shop details:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});










staticRoutes.get('/stock-Details', async (req, res) => {
    try {
        const { shopId, productId } = req.query;

        // Fetch all shops and products
        const shops = await Shop.find({});
        const products = await Product.find({});

        // Fetch stock data with optional filters
        let stockQuery = {};
        if (shopId) stockQuery.shopId = shopId;
        if (productId) stockQuery.productId = productId;

        const stockData = await Stock.find(stockQuery).populate('productId');
        // Render the EJS page with data
        res.render('stock-details', {
            shops,
            products,
            stockData,
            shopId,   // ✅ Pass shopId to EJS
            productId // ✅ Pass productId to EJS
        });

    } catch (error) {
        console.error("Error fetching stock data:", error);
        res.status(500).send("Internal Server Error");
    }
});



staticRoutes.get('/view-stock', async (req, res) => {
    try {
        const { shopId, productId } = req.query; // Get filters from query params

        // Fetch all shops and products
        const shops = await Shop.find({});
        const products = await Product.find({});

        // Fetch stock data with optional filters
        let stockQuery = {};
        if (shopId) stockQuery.shopId = shopId;
        if (productId) stockQuery.productId = productId;

        const stockData = await Stock.find(stockQuery)
            .populate('shopId')   // ✅ Populate shop details
            .populate('productId'); // ✅ Populate product details

        // Render the EJS page with data
        res.render('stock-details', {
            shops,
            products,
            stockData,
            shopId,
            productId
        });

    } catch (error) {
        console.error("Error fetching stock data:", error);
        res.status(500).send("Internal Server Error");
    }
});























module.exports = staticRoutes;
