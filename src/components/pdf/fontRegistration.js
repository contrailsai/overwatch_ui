import { Font } from '@react-pdf/renderer';

let fontsRegistered = false;

export const registerFonts = () => {
    if (fontsRegistered) return;

    Font.register({
        family: 'Outfit',
        fonts: [
            { src: '/fonts/Outfit-Regular.ttf' },
            { src: '/fonts/Outfit-Bold.ttf', fontWeight: 'bold' },
            { src: '/fonts/Outfit-Medium.ttf', fontWeight: 'medium' },
        ]
    });

    Font.registerEmojiSource({
        format: 'png',
        url: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/'
    });

    fontsRegistered = true;
};
