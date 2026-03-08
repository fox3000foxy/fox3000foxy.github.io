const fs = require('fs')
const crypto = require('crypto')
const datasets = require('./datasets.json')
function randomItem(arr) {return arr[Math.floor(Math.random() * arr.length)];}

function genererNumeroTelephone(indicatifPays) {
    let numeroAleatoire = Math.floor(Math.random() * 1000000000).toString().padStart(9, "0");
    let numeroTelephoneAleatoire = `${indicatifPays}${numeroAleatoire}`;
    return numeroTelephoneAleatoire;
}


function genererVariantePseudoMediaSocial(name, surname, pseudo, mediaSocial) {
    if (!(name && surname && pseudo && mediaSocial)) {
        return "Erreur: Paramètres manquants";
    }

    let pseudoVariante;
    const pseudoEnMinuscules = pseudo.toLowerCase();
    const nameEnMinuscules = name.toLowerCase();
    const surnameEnMinuscules = surname.toLowerCase();
	const numeroRandom = Math.floor(Math.random() * 100);
	const chiffresSuite = genererChiffresAleatoires(5);
	const variations = {instagram:[`${pseudo}_official`,`${pseudo}_real`,`${pseudo}_original`,`${pseudo}_insta`,`${pseudo}_gram`,`${pseudo}_ig`],facebook:[`${name}.${surname}.${numeroRandom}`,`${name}${surname}${numeroRandom}`,`${name}-${surname}-${numeroRandom}`,`${name}.${surname}${numeroRandom}`,`${name}${surname}_${numeroRandom}`,`${pseudo}${numeroRandom}`],linkedin:[`${name}-${surname}-a${chiffresSuite}`,`${name}.${surname}.a${chiffresSuite}`,`${name}${surname}a${chiffresSuite}`,`${name}-${surname}${chiffresSuite}`,`${name}.${surname}${chiffresSuite}`,`${name}${surname}${chiffresSuite}`],twitter:[`@${pseudoEnMinuscules}`,`@${pseudoEnMinuscules}_official`,`@${pseudoEnMinuscules}Official`,`@${pseudoEnMinuscules}Real`,`@${pseudoEnMinuscules}OfficialAccount`,`@${pseudoEnMinuscules}Fan`],paypal:[`${pseudoEnMinuscules}@paypal`,`${pseudoEnMinuscules}_paypal`,`paypal_${pseudo}`,`paypal.${pseudoEnMinuscules}`],ebay:[`ebay_${pseudoEnMinuscules}`,`${pseudoEnMinuscules}_ebay`,`ebay${pseudoEnMinuscules}`,`${pseudoEnMinuscules}_store`,`ebaystore_${pseudoEnMinuscules}`],playstation:[`${pseudoEnMinuscules}_PSN`,`${pseudoEnMinuscules}_PlayStation`,`${pseudoEnMinuscules}PS`],battlenet:[`${pseudoEnMinuscules}#${Math.floor(9999*Math.random())}`,`${pseudoEnMinuscules}#${Math.floor(9999*Math.random())}_${surnameEnMinuscules}`],bungiecord:[`${pseudoEnMinuscules}#0000`,`${pseudoEnMinuscules}#0001`,`${pseudoEnMinuscules}#0002`],reddit:[`u/${pseudoEnMinuscules}`,`user_${pseudoEnMinuscules}`,`${pseudoEnMinuscules}_reddit`,`reddit_${pseudoEnMinuscules}`],steam:[`steamcommunity.com/id/${pseudoEnMinuscules}`,`${pseudoEnMinuscules}_steam`,`steam_${pseudoEnMinuscules}`,`steam_${pseudoEnMinuscules}_id`],tiktok:[`@${pseudoEnMinuscules}_tiktok`,`tiktok_${pseudoEnMinuscules}`,`${pseudoEnMinuscules}_tiktok`],xbox:[`xbox_${pseudoEnMinuscules}`,`${pseudoEnMinuscules}_xbox`,`${pseudoEnMinuscules}_x`],crunchyroll:[`crunchy_${pseudoEnMinuscules}`,`${pseudoEnMinuscules}_crunchy`,`crunchy_${pseudoEnMinuscules}_anime`],spotify:[`spotify_${pseudoEnMinuscules}`,`${pseudoEnMinuscules}_spotify`,`music_${pseudoEnMinuscules}`],epicgames:[`epic_${pseudoEnMinuscules}`,`${pseudoEnMinuscules}_epic`,`epicgames_${pseudoEnMinuscules}`],github:[`${pseudoEnMinuscules}_github`,`${pseudoEnMinuscules}-dev`,`git_${pseudoEnMinuscules}`,`github.com/${pseudoEnMinuscules}`],riotgames:[`${pseudoEnMinuscules}_riot`,`${pseudoEnMinuscules}_games`,`riot_${pseudoEnMinuscules}`,`${pseudoEnMinuscules}_gg`],leagueoflegends:[`${pseudoEnMinuscules}_lol`,`${pseudoEnMinuscules}_league`,`${pseudoEnMinuscules}_legends`],twitch:[`${pseudoEnMinuscules}_stream`,`${pseudoEnMinuscules}TV`,`${pseudoEnMinuscules}_twitch`,`twitch_${pseudoEnMinuscules}`],youtube:[`${pseudoEnMinuscules}_YT`,`youtube.com/user/${pseudoEnMinuscules}`,`yt_${pseudoEnMinuscules}`,`${pseudoEnMinuscules}_tube`],onlyfans:[`${pseudoEnMinuscules}_fans`,`${pseudoEnMinuscules}_exclusive`,`${pseudoEnMinuscules}_content`,`only_${pseudoEnMinuscules}`]};

    switch (mediaSocial.toLowerCase()) {
        case "twitter": pseudoVariante = `@${pseudoEnMinuscules}`; break;
		case "instagram": pseudoVariante = Math.random() < 0.5 ? randomItem(variations["instagram"]).replace("${pseudo}", pseudoEnMinuscules) : pseudoEnMinuscules; break;
		case "facebook": const numeroRandom = Math.floor(Math.random() * 100); pseudoVariante = randomItem(variations["facebook"]).replace("${name}", nameEnMinuscules).replace("${surname}", surnameEnMinuscules).replace("${numeroRandom}", numeroRandom); break;
		case "linkedin": const chiffresSuite = genererChiffresAleatoires(5); pseudoVariante = randomItem(variations["linkedin"]).replace("${name}", nameEnMinuscules).replace("${surname}", surnameEnMinuscules).replace("${chiffresSuite}", chiffresSuite); break;
		case "paypal": pseudoVariante = randomItem(variations["paypal"]).replace("${name}", nameEnMinuscules).replace("${surname}", surnameEnMinuscules).replace("${pseudoEnMinuscules}", pseudoEnMinuscules); break;
		case "ebay": pseudoVariante = randomItem(variations["ebay"]).replace("${name}", nameEnMinuscules).replace("${surname}", surnameEnMinuscules).replace("${pseudoEnMinuscules}", pseudoEnMinuscules); break;
		case "playstation": pseudoVariante = randomItem(variations["playstation"]).replace("${name}", nameEnMinuscules).replace("${surname}", surnameEnMinuscules).replace("${pseudoEnMinuscules}", pseudoEnMinuscules); break;
		case "battlenet": pseudoVariante = randomItem(variations["battlenet"]).replace("${name}", nameEnMinuscules).replace("${surname}", surnameEnMinuscules).replace("${pseudoEnMinuscules}", pseudoEnMinuscules); break;
		case "bungiecord": pseudoVariante = randomItem(variations["bungiecord"]).replace("${name}", nameEnMinuscules).replace("${surname}", surnameEnMinuscules).replace("${pseudoEnMinuscules}", pseudoEnMinuscules); break;
		case "reddit": pseudoVariante = randomItem(variations["reddit"]).replace("${name}", nameEnMinuscules).replace("${surname}", surnameEnMinuscules).replace("${pseudoEnMinuscules}", pseudoEnMinuscules); break;
		case "steam": pseudoVariante = randomItem(variations["steam"]).replace("${name}", nameEnMinuscules).replace("${surname}", surnameEnMinuscules).replace("${pseudoEnMinuscules}", pseudoEnMinuscules); break;
		case "tiktok": pseudoVariante = randomItem(variations["tiktok"]).replace("${name}", nameEnMinuscules).replace("${surname}", surnameEnMinuscules).replace("${pseudoEnMinuscules}", pseudoEnMinuscules); break;
		case "xbox": pseudoVariante = randomItem(variations["xbox"]).replace("${name}", nameEnMinuscules).replace("${surname}", surnameEnMinuscules).replace("${pseudoEnMinuscules}", pseudoEnMinuscules); break;
		case "crunchyroll": pseudoVariante = randomItem(variations["crunchyroll"]).replace("${name}", nameEnMinuscules).replace("${surname}", surnameEnMinuscules).replace("${pseudoEnMinuscules}", pseudoEnMinuscules); break;
		case "spotify": pseudoVariante = randomItem(variations["spotify"]).replace("${name}", nameEnMinuscules).replace("${surname}", surnameEnMinuscules).replace("${pseudoEnMinuscules}", pseudoEnMinuscules); break;
		case "epicgames": pseudoVariante = randomItem(variations["epicgames"]).replace("${name}", nameEnMinuscules).replace("${surname}", surnameEnMinuscules).replace("${pseudoEnMinuscules}", pseudoEnMinuscules); break;
		case "github": pseudoVariante = randomItem(variations["github"]).replace("${name}", nameEnMinuscules).replace("${surname}", surnameEnMinuscules).replace("${pseudoEnMinuscules}", pseudoEnMinuscules); break;
		case "riotgames": pseudoVariante = randomItem(variations["riotgames"]).replace("${name}", nameEnMinuscules).replace("${surname}", surnameEnMinuscules).replace("${pseudoEnMinuscules}", pseudoEnMinuscules); break;
		case "onlyfans": pseudoVariante = randomItem(variations["onlyfans"]).replace("${name}", nameEnMinuscules).replace("${surname}", surnameEnMinuscules).replace("${pseudoEnMinuscules}", pseudoEnMinuscules); break;
		case "twitch": pseudoVariante = randomItem(variations["twitch"]).replace("${name}", nameEnMinuscules).replace("${surname}", surnameEnMinuscules).replace("${pseudoEnMinuscules}", pseudoEnMinuscules); break;
		case "youtube": pseudoVariante = generateYouTubeChannelID(); break;
		default: pseudoVariante = pseudoEnMinuscules; break;
    }

    return pseudoVariante;
}

function genererChiffresAleatoires(longueur) {
    let chiffres = '';
    for (let i = 0; i < longueur; i++) {chiffres += Math.floor(Math.random() * 10); }
    return chiffres;
}

function construireAdresseEmailCredible(nom, prenom, countryCode) {
	const domaines = datasets.mailboxes;
	// console.log(domaines)

    if (nom && prenom) {
        let nomEnMinuscules = nom.toLowerCase();
        let prenomEnMinuscules = prenom.toLowerCase();

        let domaineAleatoire = randomItem(domaines[countryCode]);
        let choixVariante = Math.floor(Math.random() * 10); 

        let adresseEmail;

        switch (choixVariante) {
            case 0:adresseEmail = `${prenomEnMinuscules}.${nomEnMinuscules}@${domaineAleatoire}`;break;
            case 1:adresseEmail = `${prenomEnMinuscules}${nomEnMinuscules}@${domaineAleatoire}`;break;
            case 2:adresseEmail = `${nomEnMinuscules}.${prenomEnMinuscules}@${domaineAleatoire}`;break;
            case 3:adresseEmail = `${nomEnMinuscules}${prenomEnMinuscules}@${domaineAleatoire}`;break;
            case 4:adresseEmail = `${prenomEnMinuscules.charAt(0)}${nomEnMinuscules}@${domaineAleatoire}`;break;
            case 5:adresseEmail = `${prenomEnMinuscules.charAt(0)}${nomEnMinuscules}@${domaineAleatoire}`;break;
            case 6:adresseEmail = `${prenomEnMinuscules}_${nomEnMinuscules}@${domaineAleatoire}`;break;
            case 7:adresseEmail = `${prenomEnMinuscules}_${nomEnMinuscules}@${domaineAleatoire}`;break;
            case 8:adresseEmail = `${prenomEnMinuscules}.${nomEnMinuscules}${genererChiffresAleatoires(3)}@${domaineAleatoire}`;break;
            case 9:adresseEmail = `${nomEnMinuscules}${prenomEnMinuscules}${genererChiffresAleatoires(3)}@${domaineAleatoire}`;break;
        }

        return adresseEmail;
    } else {
        return "Erreur: Nom ou prénom manquant";
    }
}

function cc_gen() {

    var cardNumber = [],
        checksum = 0,
        issuer,
        expiryMonth,
        expiryYear,
        cvv;

    var issuers = ["Mastercard", "Visa", "American Express", "Discover"];
    var randomIssuerIndex = Math.floor(Math.random() * issuers.length);
    issuer = issuers[randomIssuerIndex];

    var firstDigits = (Math.floor(Math.random() * 9) + 1) + "" + (Math.floor(Math.random() * 10)) + "" + (Math.floor(Math.random() * 10));

    expiryYear = new Date().getFullYear() + Math.floor(Math.random() * 5) + 1;

    switch (issuer) {
        case "Visa":
            cardNumber.push(4);
            break;
        case "Mastercard":
            cardNumber.push(5);
            cardNumber.push(1 + Math.floor(Math.random() * 5));
            break;
        case "American Express":
            cardNumber.push(3);
            cardNumber.push(4 + Math.floor(Math.random() * 4));

            firstDigits += (Math.floor(Math.random() * 10));
            break;
        case "Discover":
            cardNumber.push(6);
            cardNumber.push(0);
            cardNumber.push(1);
            cardNumber.push(1);
            break;
    }

    var cardLength = issuer === "American Express" ? 15 : 16;
    for (var i = cardNumber.length; i < cardLength - 1; i++) {
        cardNumber.push(Math.floor(Math.random() * 10));
    }

    for (var i = 0; i < cardLength - 1; i++) {
        var digit = cardNumber[i];
        if ((i + 1) % 2 === cardLength % 2) {
            digit *= 2;
            if (digit > 9) {
                digit -= 9;
            }
        }
        checksum += digit;
    }
    var checksumDigit = (10 - (checksum % 10)) % 10;
    cardNumber.push(checksumDigit);

    var cardNumberStr = cardNumber.join("");

    cvv = (Math.floor(Math.random() * 9) + "" + Math.floor(Math.random() * 9) + "" + Math.floor(Math.random() * 9));

    expiryMonth = Math.floor(Math.random() * 12) + 1;

    return {
        cc: cardNumberStr,
        cvv: cvv,
        issuer: issuer,
        exp_year: expiryYear,
        exp_month: expiryMonth
    };
}

usernamesTemplate = datasets.usernames
usernames = [...usernamesTemplate]

function getRandomUsername() {
	let usernameIndex = Math.floor(Math.random() * usernames.length)
	let username = usernames[usernameIndex]

	if(usernames.length == 0) usernames = [...usernamesTemplate]
	return username
}

function genererDateAleatoire() {

  const dateActuelle = new Date();
  const dateIlYa13Ans = new Date(dateActuelle);
  dateIlYa13Ans.setFullYear(dateIlYa13Ans.getFullYear() - 13);
  const dateIlYa30Ans = new Date(dateActuelle);
  dateIlYa30Ans.setFullYear(dateIlYa30Ans.getFullYear() - 30);
  const dateAleatoire = new Date(
    dateIlYa13Ans.getTime() + Math.random() * (dateIlYa30Ans.getTime() - dateIlYa13Ans.getTime())
  );

  return dateAleatoire;
}

function getAge(birthDate) {
	var today = new Date();
	var age = today.getFullYear() - birthDate.getFullYear();
	var m = today.getMonth() - birthDate.getMonth();
	if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
		age--;
	}
	return age;
}

var countries = datasets.countries;

function getContinent(countryCode) {
    const continentsCountries = datasets.continentsCountries;

    for (const continent in continentsCountries) {
        if (continentsCountries[continent].includes(countryCode)) {
            return continent;
        }
    }

    return "Unknown";
}

const preferencesPublicitaires = datasets.adChoices

function genererPreferences(categories, gender) {
    categories.forEach(categorie => {
        const categorieName = Object.keys(categorie)[0];
        const coef = Math.random() * 1 + 0.5;
        categorie[categorieName][gender] *= coef;
    });

    categories.sort((a, b) => b[Object.keys(b)[0]][gender] - a[Object.keys(a)[0]][gender]);
    const categoriesSelectionnees = categories.slice(0, Math.floor(Math.random() * 6) + 15);

    const preferences = {};
    categoriesSelectionnees.forEach(categorie => {
        const categorieName = Object.keys(categorie)[0];
        const score = categorie[categorieName][gender];
        preferences[categorieName] = score;
    });
    return preferences;
}

function generateYouTubeChannelID() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const length = 22;
  let channelID = 'UC';

  for (let i = 0; i < length; i++) {
    channelID += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  return channelID;
}

function generateFakeProfile(params) {
	//console.log("Parameters:", params)
	let {countryName,birthGender} = params
	if(!countryName)
		country = countries[Math.floor(Math.random() * countries.length)]
	else 
		country = countries.find(u=>u.name==countryName)
	let continent = getContinent(country.abbreviation)
	while(continent == "Unknown") {country = countries[Math.floor(Math.random() * countries.length)];continent = getContinent(country.abbreviation)}

    if(!birthGender)
		birthGender = ["Male","Female"][Math.random()<0.5?0:1];
	const person = {
		name: randomItem(datasets[country.abbreviation][birthGender.toLowerCase()+"_first"]),
		surname: randomItem(datasets[country.abbreviation].last)
	}

    const phoneNumber = genererNumeroTelephone(country.phoneCode);
	const username = getRandomUsername()

	
	let social_media = {};
	social_media["twitter"] = Math.random() < 0.3 ? null : genererVariantePseudoMediaSocial(person.name, person.surname, username, "twitter");
	social_media["instagram"] = Math.random() < 0.1 ? null : genererVariantePseudoMediaSocial(person.name, person.surname, username, "instagram");
	social_media["facebook"] = Math.random() < 0.4 ? null : genererVariantePseudoMediaSocial(person.name, person.surname, username, "facebook");
	social_media["linkedin"] = Math.random() < 0.6 ? null : genererVariantePseudoMediaSocial(person.name, person.surname, username, "linkedin");
	social_media["paypal"] = Math.random() < 0.5 ? null : genererVariantePseudoMediaSocial(person.name, person.surname, username, "paypal");
	social_media["ebay"] = Math.random() < 0.4 ? null : genererVariantePseudoMediaSocial(person.name, person.surname, username, "ebay");
	social_media["playstation"] = Math.random() < 0.2 ? null : genererVariantePseudoMediaSocial(person.name, person.surname, username, "playstation");
	social_media["battlenet"] = Math.random() < 0.3 ? null : genererVariantePseudoMediaSocial(person.name, person.surname, username, "battlenet");
	social_media["bungiecord"] = Math.random() < 0.2 ? null : genererVariantePseudoMediaSocial(person.name, person.surname, username, "bungiecord");
	social_media["reddit"] = Math.random() < 0.4 ? null : genererVariantePseudoMediaSocial(person.name, person.surname, username, "reddit");
	social_media["steam"] = Math.random() < 0.5 ? null : genererVariantePseudoMediaSocial(person.name, person.surname, username, "steam");
	social_media["tiktok"] = Math.random() < 0.3 ? null : genererVariantePseudoMediaSocial(person.name, person.surname, username, "tiktok");
	social_media["xbox"] = Math.random() < 0.4 ? null : genererVariantePseudoMediaSocial(person.name, person.surname, username, "xbox");
	social_media["crunchyroll"] = Math.random() < 0.2 ? null : genererVariantePseudoMediaSocial(person.name, person.surname, username, "crunchyroll");
	social_media["spotify"] = Math.random() < 0.5 ? null : genererVariantePseudoMediaSocial(person.name, person.surname, username, "spotify");
	social_media["epicgames"] = Math.random() < 0.3 ? null : genererVariantePseudoMediaSocial(person.name, person.surname, username, "epicgames");
	social_media["github"] = Math.random() < 0.4 ? null : genererVariantePseudoMediaSocial(person.name, person.surname, username, "github");
	social_media["riotgames"] = Math.random() < 0.6 ? null : genererVariantePseudoMediaSocial(person.name, person.surname, username, "riotgames");
	// Compte RiotGames implique un compte LeagueOfLegends
	if (social_media["riotgames"]) {
		social_media["leagueoflegends"] = Math.random() < 0.8 ? null : social_media["riotgames"];
	}
	social_media["onlyfans"] = Math.random() < 0.3 ? null : genererVariantePseudoMediaSocial(person.name, person.surname, username, "onlyfans");
	social_media["twitch"] = Math.random() < 0.4 ? null : username;
	social_media["youtube"] = Math.random() < 0.3 ? null : genererVariantePseudoMediaSocial(person.name, person.surname, username, "youtube");

    const email = construireAdresseEmailCredible(person.surname, person.name,country.abbreviation);

	let creditCardInfo = cc_gen();
	while(creditCardInfo.cc.length!=16) {creditCardInfo = cc_gen();}
	let randomDate = genererDateAleatoire();

	const preferences = genererPreferences(preferencesPublicitaires, birthGender);
	const preferencesJSON = JSON.stringify(preferences);
	const preferencesBase64 = Buffer.from(preferencesJSON).toString('base64');

	const password = randomItem(datasets.common.passwords)+randomItem(datasets.common.passwords)+range(100,999)
	const salt = range(2,8)
	const street = randomItem(datasets[country.abbreviation].street);
	const city = randomItem(datasets[country.abbreviation].cities);
	const state = randomItem(datasets[country.abbreviation].states);

	const sexualities = ["Lesbian","Gay","Bisexual","Transgender","Queer","Intersex","Asexual","Pansexual","Non-binary","Genderqueer","Androgyne","Bigenre","Agender","Genderfluid","Demisexual","Graysexual","Skoliosexual","Homoflexible","Heteroflexible","Queerplatonic","Polyamorous","Monogamous","Pangender","Omnisexual","Questioning","Two-Spirit","Autosexual","Gynesexual","Androphilia","Gynephilia","Sapiosexual","Demiromantic","Heteroromantic","Homoromantic","Biromantic","Panromantic","Polyromantic","Aroromantic","Greyromantic","Lithromantic","Frayromantic","Quoiromantic","Akoiromantic","Cupioromantic","Platoniromantic","Demisexuality","Lithsexuality","Fraysexuality","Apollosexuality","Queerplatonic"];
    const fakeProfile = {
        name: person.name,
        surname: person.surname,
		birth: randomDate.toGMTString(),
		age: getAge(randomDate),
        username,
        birthGender: birthGender,
		actualGender: Math.random()<0.3?birthGender:sexualities[Math.floor(Math.random() * sexualities.length)],
        phone_number: phoneNumber,
		location: {
			street: {
				number: range(1,100),
				name:street
			},
			city: city,
			state: state,
			country: country,
			continent: continent,
		},
        email: email,
		passwords: {
			raw:    password,
			salt:   salt,
			md5:    crypto.createHash('md5').update(password + salt).digest('hex'),
			sha1:   crypto.createHash('sha1').update(password + salt).digest('hex'),
			sha256: crypto.createHash('sha256').update(password + salt).digest('hex')			
		},
        social_media: social_media,
        credit_card: {
            number: creditCardInfo.cc,
            cvv: creditCardInfo.cvv,
            issuer: creditCardInfo.issuer,
            expiration_year: creditCardInfo.exp_year,
            expiration_month: creditCardInfo.exp_month
        },
	    adChoices: preferencesBase64
    };

    return JSON.stringify(fakeProfile, null, 2);
}

function generateFakeProfilesBatch(batchSize,params) {
    const profiles = [];
    for (let i = 0; i < batchSize; i++) {
        profiles.push(JSON.parse(generateFakeProfile(params)));
    }
    return profiles;
}

function range(min, max) {
	return Math.floor(Math.random() * (max-min)) + min
}

function composeCSVFile(data) {
    const header = "name;surname;birth;age;location_street_number;location_street_name;location_city;location_state;location_country_name;location_country_abbreviation;location_country_phoneCode;location_continent;username;birthGender;actualGender;phone_number;social_media_twitter;social_media_instagram;social_media_facebook;social_media_linkedin;social_media_youtube;social_media_twitch;email;credit_card_number;credit_card_cvv;credit_card_issuer;credit_card_expiration_month;credit_card_expiration_year;passwords_raw;passwords_salt;passwords_md5;passwords_sha1;passwords_sha256;adChoices\n";

    const rows = data.map(profile => {
        const formattedProfile = [
            profile.name,
            profile.surname,
            profile.birth.split(",").join(" "),
            profile.age,
            profile.location.street.number,
            profile.location.street.name,
            profile.location.city,
            profile.location.state,
            profile.location.country.name,
            profile.location.country.abbreviation,
            profile.location.country.phoneCode,
            profile.location.continent,
            profile.username,
            profile.birthGender,
            profile.actualGender,
            profile.phone_number,
            [profile.social_media.twitter, profile.social_media.instagram, profile.social_media.facebook, profile.social_media.linkedin, profile.social_media.youtube, profile.social_media.twitch].join(';'),
            profile.email,
            [profile.credit_card.number, profile.credit_card.cvv, profile.credit_card.issuer, profile.credit_card.expiration_month, profile.credit_card.expiration_year].join(';'),
            profile.passwords.raw,
            profile.passwords.salt,
            profile.passwords.md5,
            profile.passwords.sha1,
            profile.passwords.sha256,
            profile.adChoices
        ];
        return formattedProfile.join(';');
    }).join('\n');

    return header + rows;
}

function generateAndComposeCSV(totalProfiles, batchSize, params) {
    const profiles = [];
	for (let i = 0; i < totalProfiles / batchSize; i++) {
        console.log("Generated", i * batchSize);
        const batch = generateFakeProfilesBatch(batchSize,params);
        profiles.push(...batch);
    }
	// console.log(profiles)
    return composeCSVFile(profiles);
}

function writeCSVFile(filename,content) {
	fs.writeFileSync(filename, content);
}

module.exports = (name,{app})=>{
	app.get('/fake-profile',(req,res)=>{
			count = req.query.count || 1
			if(count < 1) res.send("Minimum is 1")
			if(count > 5000) res.send("Maximum is 1000")
			else {
				if(req.query.format=="csv")
					res.send(generateAndComposeCSV(parseInt(count),parseInt(count),{countryName:req.query.countryName||null, birthGender: req.query.birthGender||null}))
				else
					res.send(generateFakeProfilesBatch(parseInt(count),{countryName:req.query.countryName||null, birthGender: req.query.birthGender||null}))
			}

	})
}

// console.log(JSON.stringify(generateFakeProfilesBatch(1),0,2))

// const csvContent = generateAndComposeCSV(100000,1000) //Génération de 1000 profils par troçons de 100
// console.log(csvContent)
// writeCSVFile('100k-profiles.csv',csvContent)
