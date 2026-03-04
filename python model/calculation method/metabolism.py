from attrs import define, field

class metabolism():
        
    def BMR(self, weight:float, hight:float, ages:float, sexul:str):
        '''Mifflin–St Jeor Equation\n
        weight(kg)\n 
        hight(cm)\n 
        ages(year)\n
        sexul = 'MAN','WOMAN' '''
        man_BMR = 10*weight + 6.25*hight - 5*ages + 5
        woman_BMR = 10*weight + 6.25*hight - 5*ages - 161

        if sexul == 'MAN':
            return man_BMR
        else:
            return woman_BMR
        
    def BMR_high_accuracy(self, weight:float, fat_percentage:float):
        '''Katch–McArdle \n
        weight(kg)\n
        fat_percentage(float)'''
        LBM = weight*(1 - fat_percentage)
        BMR = 370 + (21.6*LBM)
        return BMR
    
    def BMR_althlete(self, weight:float, fat_percentage:float):
        '''Cunningham Equation \n
        weight(kg)\n
        fat_percentage(float)'''
        LBM = weight*(1 - fat_percentage)
        BMR = 500 + (22*LBM)
        return BMR
    
    def TDEE(self, BMR, PAL:str):
        '''TDEE \n
        PAL = Physical Activity Level \n
        'sit':1.2 \n
        'light_activity':1.375 \n
        'normal_training':1.55 \n
        'hard_training':1.725 \n
        'althlete':1.9'''

        pal_dict = {'sit':1.2,
        'light_activity':1.375,
        'normal_training':1.55,
        'hard_training':1.725,
        'althlete':1.9}
        pal_value = pal_dict.get(PAL)
        TDEE=BMR*pal_value
        return TDEE
